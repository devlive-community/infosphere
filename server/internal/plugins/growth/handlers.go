package growth

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm/clause"

	"infosphere/server/internal/authz"
	"infosphere/server/internal/models"
	"infosphere/server/internal/plugincore"
	"infosphere/server/internal/plugins"
)

// behavior 承载「成长等级」插件的对外端点。经验记账/等级重算等服务层（由核心阅读/评论/发布等事件触发）
// 仍属核心集成，保留在 app；本子包只负责查看/管理端点。
type behavior struct{ core plugincore.Core }

func init() { plugincore.RegisterBehavior(&behavior{}) }

func (b *behavior) Key() string { return plugins.KeyGrowth }

func (b *behavior) RegisterRoutes(api *gin.RouterGroup, core plugincore.Core) {
	b.core = core
	feat := core.RequireFeaturePlugin(plugins.KeyGrowth)
	// 公开
	api.GET("/growth/settings", core.OptionalAuth(), b.GrowthSettings)
	api.GET("/growth/levels", core.OptionalAuth(), feat, b.GrowthLevels)
	api.GET("/users/:username/growth", core.OptionalAuth(), feat, b.PublicUserGrowth)
	// 本人
	api.GET("/users/me/growth", core.RequireAuth(), feat, core.RequirePermissionMiddleware(authz.GrowthRead), b.MyGrowth)
	api.GET("/users/me/experience-events", core.RequireAuth(), feat, core.RequirePermissionMiddleware(authz.GrowthRead), b.MyExperienceEvents)
	api.PUT("/users/me/growth/display", core.RequireAuth(), feat, core.RequirePermissionMiddleware(authz.GrowthUpdate), b.UpdateMyGrowthDisplay)
	// 管理员
	adminGuard := []gin.HandlerFunc{core.RequireAuth(), core.RequireAdmin(), feat}
	reg := func(method, path string, perm authz.Permission, h gin.HandlerFunc) {
		hs := append(append([]gin.HandlerFunc{}, adminGuard...), core.RequirePermissionMiddleware(perm), h)
		api.Handle(method, path, hs...)
	}
	reg(http.MethodGet, "/admin/growth/levels", authz.GrowthManage, b.AdminListLevels)
	reg(http.MethodPost, "/admin/growth/levels", authz.GrowthManage, b.AdminCreateLevel)
	reg(http.MethodPut, "/admin/growth/levels/:id", authz.GrowthManage, b.AdminUpdateLevel)
	reg(http.MethodDelete, "/admin/growth/levels/:id", authz.GrowthManage, b.AdminDeleteLevel)
	reg(http.MethodPost, "/admin/growth/adjust", authz.ExperienceAdjust, b.AdminAdjustExperience)
	reg(http.MethodGet, "/admin/growth/rules", authz.GrowthManage, b.AdminListExperienceRules)
	reg(http.MethodPut, "/admin/growth/rules/:id", authz.GrowthManage, b.AdminUpdateExperienceRule)
}

// —— 本子包私有的读取/组装辅助（与原 app 内实现一致）——

func changedFields(fields ...string) map[string]any { return map[string]any{"changed_fields": fields} }
func auditID(id uint) string                        { return strconv.FormatUint(uint64(id), 10) }

func (b *behavior) growthProfile(userID uint) models.UserGrowthProfile {
	p := models.UserGrowthProfile{UserID: userID, Public: true, CurrentLevel: 1, HighestLevel: 1}
	b.core.Gorm().Where("user_id = ?", userID).First(&p)
	return p
}

func (b *behavior) growthPayload(p models.UserGrowthProfile) gin.H {
	db := b.core.Gorm()
	var current models.LevelDefinition
	db.Where("level = ?", p.CurrentLevel).First(&current)
	var next models.LevelDefinition
	hasNext := db.Where("status = ? AND min_xp > ?", "active", current.MinXP).Order("min_xp ASC").First(&next).Error == nil
	pct := 100
	if hasNext && next.MinXP > current.MinXP {
		pct = int(float64(p.LifetimeXP-int64(current.MinXP)) / float64(next.MinXP-current.MinXP) * 100)
		if pct < 0 {
			pct = 0
		} else if pct > 100 {
			pct = 100
		}
	}
	out := gin.H{
		"lifetime_xp": p.LifetimeXP, "current_level": p.CurrentLevel, "highest_level": p.HighestLevel,
		"public": p.Public, "level": current, "progress_percent": pct,
	}
	if hasNext {
		out["next_level"] = next
		out["xp_to_next"] = next.MinXP - int(p.LifetimeXP)
	}
	return out
}

// —— 公开端点 ——

func (b *behavior) GrowthSettings(c *gin.Context) {
	b.core.OK(c, gin.H{"enabled": b.core.PluginEnabled(plugins.KeyGrowth)})
}

func (b *behavior) GrowthLevels(c *gin.Context) {
	levels := []models.LevelDefinition{}
	b.core.Gorm().Where("status = ?", "active").Order("level ASC").Find(&levels)
	b.core.OK(c, gin.H{"items": levels})
}

func (b *behavior) PublicUserGrowth(c *gin.Context) {
	core := b.core
	var u models.User
	if err := core.Gorm().Where("username = ?", c.Param("username")).First(&u).Error; err != nil {
		core.Fail(c, http.StatusNotFound, "用户不存在")
		return
	}
	p := b.growthProfile(u.ID)
	if !p.Public {
		core.OK(c, gin.H{"public": false})
		return
	}
	core.OK(c, b.growthPayload(p))
}

// —— 本人端点 ——

func (b *behavior) MyGrowth(c *gin.Context) {
	u := b.core.CurrentUser(c)
	b.core.OK(c, b.growthPayload(b.growthProfile(u.ID)))
}

func (b *behavior) MyExperienceEvents(c *gin.Context) {
	core := b.core
	u := core.CurrentUser(c)
	page, pageSize := core.Paginate(c)
	var total int64
	core.Gorm().Model(&models.ExperienceEvent{}).Where("user_id = ?", u.ID).Count(&total)
	events := []models.ExperienceEvent{}
	core.Gorm().Where("user_id = ?", u.ID).Order("created_at DESC").
		Limit(pageSize).Offset((page - 1) * pageSize).Find(&events)
	core.OK(c, plugincore.PageResult{Items: events, Total: total, Page: page, PageSize: pageSize})
}

func (b *behavior) UpdateMyGrowthDisplay(c *gin.Context) {
	core := b.core
	u := core.CurrentUser(c)
	var req struct {
		Public bool `json:"public"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		core.Fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	p := b.growthProfile(u.ID)
	p.Public = req.Public
	core.Gorm().Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "user_id"}}, UpdateAll: true}).Create(&p)
	core.OK(c, gin.H{"public": p.Public})
}

// —— 管理端点 ——

func (b *behavior) AdminListLevels(c *gin.Context) {
	levels := []models.LevelDefinition{}
	b.core.Gorm().Order("level ASC").Find(&levels)
	b.core.OK(c, gin.H{"items": levels})
}

type levelRequest struct {
	Level       int    `json:"level"`
	Name        string `json:"name"`
	Description string `json:"description"`
	IconType    string `json:"icon_type"`
	IconValue   string `json:"icon_value"`
	Color       string `json:"color"`
	MinXP       int    `json:"min_xp"`
	Status      string `json:"status"`
}

func normalizeLevel(req *levelRequest) bool {
	req.Name = strings.TrimSpace(req.Name)
	if req.Level < 1 || req.MinXP < 0 || req.Name == "" {
		return false
	}
	if req.IconType != "image" && req.IconType != "svg" {
		req.IconType = "fa"
	}
	if req.IconValue == "" {
		req.IconValue = "fa-star"
	}
	if req.Status != "archived" {
		req.Status = "active"
	}
	return true
}

func (b *behavior) AdminCreateLevel(c *gin.Context) {
	core := b.core
	var req levelRequest
	if err := c.ShouldBindJSON(&req); err != nil || !normalizeLevel(&req) {
		core.Fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	var dup int64
	core.Gorm().Model(&models.LevelDefinition{}).Where("level = ?", req.Level).Count(&dup)
	if dup > 0 {
		core.Fail(c, http.StatusConflict, "等级编号已存在")
		return
	}
	lvl := models.LevelDefinition{
		Level: req.Level, Key: fmt.Sprintf("lv%d", req.Level), Name: req.Name, Description: req.Description,
		IconType: req.IconType, IconValue: req.IconValue, Color: req.Color, MinXP: req.MinXP,
		SortOrder: req.Level, Status: req.Status,
	}
	if err := core.Gorm().Create(&lvl).Error; err != nil {
		core.Fail(c, http.StatusInternalServerError, "创建失败: "+err.Error())
		return
	}
	core.RecordAudit(c, "growth.level_created", "growth", strconv.Itoa(req.Level), lvl.Name, changedFields("level", "min_xp"))
	core.OK(c, lvl)
}

func (b *behavior) AdminUpdateLevel(c *gin.Context) {
	core := b.core
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		core.Fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	var lvl models.LevelDefinition
	if err := core.Gorm().First(&lvl, id).Error; err != nil {
		core.Fail(c, http.StatusNotFound, "等级不存在")
		return
	}
	var req levelRequest
	if err := c.ShouldBindJSON(&req); err != nil || !normalizeLevel(&req) {
		core.Fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if lvl.Level == 1 {
		req.MinXP = 0
	}
	if err := core.Gorm().Model(&lvl).Updates(map[string]any{
		"name": req.Name, "description": req.Description, "icon_type": req.IconType,
		"icon_value": req.IconValue, "color": req.Color, "min_xp": req.MinXP, "status": req.Status,
	}).Error; err != nil {
		core.Fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
		return
	}
	core.RecordAudit(c, "growth.level_updated", "growth", strconv.Itoa(lvl.Level), req.Name, changedFields("name", "min_xp", "status"))
	core.OK(c, lvl)
}

func (b *behavior) AdminDeleteLevel(c *gin.Context) {
	core := b.core
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		core.Fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	var lvl models.LevelDefinition
	if err := core.Gorm().First(&lvl, id).Error; err != nil {
		core.Fail(c, http.StatusNotFound, "等级不存在")
		return
	}
	if lvl.Level == 1 {
		core.Fail(c, http.StatusBadRequest, "等级 1 不可删除")
		return
	}
	core.Gorm().Delete(&lvl)
	core.RecordAudit(c, "growth.level_deleted", "growth", strconv.Itoa(lvl.Level), lvl.Name, changedFields("deleted"))
	core.OK(c, gin.H{"message": "已删除"})
}

func (b *behavior) AdminListExperienceRules(c *gin.Context) {
	rules := []models.ExperienceRule{}
	b.core.Gorm().Order("sort_order ASC, id ASC").Find(&rules)
	b.core.OK(c, gin.H{"items": rules})
}

func (b *behavior) AdminUpdateExperienceRule(c *gin.Context) {
	core := b.core
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		core.Fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	var rule models.ExperienceRule
	if err := core.Gorm().First(&rule, id).Error; err != nil {
		core.Fail(c, http.StatusNotFound, "规则不存在")
		return
	}
	var req struct {
		BaseXP   int  `json:"base_xp"`
		DailyCap int  `json:"daily_cap"`
		Enabled  bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		core.Fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if req.BaseXP < 0 {
		req.BaseXP = 0
	}
	if req.DailyCap < 0 {
		req.DailyCap = 0
	}
	if err := core.Gorm().Model(&rule).Updates(map[string]any{"base_xp": req.BaseXP, "daily_cap": req.DailyCap, "enabled": req.Enabled}).Error; err != nil {
		core.Fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
		return
	}
	core.RecordAudit(c, "growth.rule_updated", "growth", rule.RuleKey, rule.Label, changedFields("base_xp", "daily_cap", "enabled"))
	core.OK(c, rule)
}

func (b *behavior) AdminAdjustExperience(c *gin.Context) {
	core := b.core
	admin := core.CurrentUser(c)
	var req struct {
		Username string `json:"username"`
		XP       int    `json:"xp"`
		Reason   string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Username) == "" || req.XP == 0 || strings.TrimSpace(req.Reason) == "" {
		core.Fail(c, http.StatusBadRequest, "请填写用户名、非零经验与原因")
		return
	}
	var target models.User
	if err := core.Gorm().Where("username = ?", strings.TrimSpace(req.Username)).First(&target).Error; err != nil {
		core.Fail(c, http.StatusNotFound, "用户不存在")
		return
	}
	dedupe := fmt.Sprintf("admin.adjust:%d:%d:%d", target.ID, admin.ID, time.Now().UnixNano())
	core.RecordExperience(target.ID, "admin.adjust", "user", strconv.FormatUint(uint64(admin.ID), 10), dedupe, req.XP, strings.TrimSpace(req.Reason))
	core.RecordAudit(c, "growth.experience_adjusted", "user", auditID(target.ID), target.Username, map[string]any{"xp": req.XP, "reason": req.Reason})
	core.OK(c, b.growthPayload(b.growthProfile(target.ID)))
}
