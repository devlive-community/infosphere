package app

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm/clause"
)

// ---- 成长等级：服务层 ----

// seedDefaultLevels 首次启用时种子一套默认等级（已存在则跳过）。
func (a *App) seedDefaultLevels() {
	var count int64
	a.DB.Model(&models.LevelDefinition{}).Count(&count)
	if count > 0 {
		return
	}
	thresholds := []int{0, 100, 250, 500, 1000, 2000, 4000, 8000, 16000, 32000}
	colors := []string{"#94a3b8", "#22c55e", "#0ea5e9", "#6366f1", "#a855f7", "#ec4899", "#f59e0b", "#ef4444", "#14b8a6", "#eab308"}
	for i, min := range thresholds {
		lvl := i + 1
		a.DB.Create(&models.LevelDefinition{
			Level: lvl, Key: fmt.Sprintf("lv%d", lvl), Name: fmt.Sprintf("Lv.%d", lvl),
			IconType: "fa", IconValue: "fa-star", Color: colors[i%len(colors)],
			MinXP: min, SortOrder: lvl, Status: "active",
		})
	}
}

// seedExperienceRules 首次启用时种子默认经验规则（已存在则跳过）。
func (a *App) seedExperienceRules() {
	var count int64
	a.DB.Model(&models.ExperienceRule{}).Count(&count)
	if count > 0 {
		return
	}
	defaults := []models.ExperienceRule{
		{RuleKey: "reading.chapter", Label: "阅读章节（首次）", BaseXP: 5, DailyCap: 50, Enabled: true, SortOrder: 1},
		{RuleKey: "creation.chapter_published", Label: "发布章节", BaseXP: 10, DailyCap: 100, Enabled: true, SortOrder: 2},
		{RuleKey: "community.comment", Label: "发表评论", BaseXP: 3, DailyCap: 30, Enabled: true, SortOrder: 3},
	}
	for i := range defaults {
		a.DB.Create(&defaults[i])
	}
}

// experienceRule 读取经验规则。
func (a *App) experienceRule(ruleKey string) (models.ExperienceRule, bool) {
	var r models.ExperienceRule
	if a.DB.Where("rule_key = ?", ruleKey).First(&r).Error != nil {
		return r, false
	}
	return r, true
}

// awardExperience 按「经验规则」给固定事件发经验：读取 base_xp，并执行每人每日上限。
// 用于 reading/creation/community 等由规则决定金额的事件（成就/管理员调整用 RecordExperience 直接给金额）。
func (a *App) awardExperience(userID uint, ruleKey, sourceType, sourceID, dedupeKey string) {
	if !a.pluginEnabled(pluginGrowth) || userID == 0 {
		return
	}
	r, ok := a.experienceRule(ruleKey)
	if !ok || !r.Enabled || r.BaseXP == 0 {
		return
	}
	if r.DailyCap > 0 {
		var todaySum int64
		start := analyticsDayStart(currentTime())
		a.DB.Model(&models.ExperienceEvent{}).
			Where("user_id = ? AND rule_key = ? AND created_at >= ?", userID, ruleKey, start).
			Select("COALESCE(SUM(final_xp),0)").Scan(&todaySum)
		if todaySum >= int64(r.DailyCap) {
			return // 已达每日上限，不再入账
		}
	}
	a.RecordExperience(userID, ruleKey, sourceType, sourceID, dedupeKey, r.BaseXP, "")
}

// resolveLevel 按经验总量解析当前等级编号（取 min_xp<=xp 的最高 active 等级；无则 1）。
func (a *App) resolveLevel(xp int64) int {
	var lvl models.LevelDefinition
	if err := a.DB.Where("status = ? AND min_xp <= ?", "active", xp).Order("min_xp DESC, level DESC").First(&lvl).Error; err != nil {
		return 1
	}
	return lvl.Level
}

// recalcGrowthProfile 从经验流水重算用户成长资料（权威汇总），并在等级变化时写历史 + 升级通知。
func (a *App) recalcGrowthProfile(userID uint) {
	var total int64
	a.DB.Model(&models.ExperienceEvent{}).Where("user_id = ?", userID).Select("COALESCE(SUM(final_xp),0)").Scan(&total)
	newLevel := a.resolveLevel(total)

	var p models.UserGrowthProfile
	if err := a.DB.Where("user_id = ?", userID).First(&p).Error; err != nil {
		p = models.UserGrowthProfile{UserID: userID, Public: true, CurrentLevel: 1, HighestLevel: 1}
	}
	oldLevel := p.CurrentLevel
	if oldLevel < 1 {
		oldLevel = 1
	}
	p.LifetimeXP = total
	p.CurrentLevel = newLevel
	if newLevel > p.HighestLevel {
		p.HighestLevel = newLevel
	}
	a.DB.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "user_id"}}, UpdateAll: true}).Create(&p)

	if newLevel != oldLevel {
		a.DB.Create(&models.UserLevelHistory{UserID: userID, FromLevel: oldLevel, ToLevel: newLevel, Reason: "xp"})
		if newLevel > oldLevel {
			a.Notify(userID, "growth", fmt.Sprintf("成长升级：Lv.%d", newLevel), map[string]any{"link": "/user/growth"})
		}
	}
}

// RecordExperience 幂等记账一条经验流水并重算资料。dedupeKey 唯一，重复/并发只落一条。
func (a *App) RecordExperience(userID uint, ruleKey, sourceType, sourceID, dedupeKey string, xp int, reason string) {
	if !a.pluginEnabled(pluginGrowth) || userID == 0 || xp == 0 || dedupeKey == "" {
		return
	}
	ev := models.ExperienceEvent{
		UserID: userID, RuleKey: ruleKey, SourceType: sourceType, SourceID: sourceID,
		DedupeKey: dedupeKey, BaseXP: xp, FinalXP: xp, Reason: reason,
	}
	res := a.DB.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "dedupe_key"}}, DoNothing: true}).Create(&ev)
	if res.Error != nil || res.RowsAffected == 0 {
		return // 幂等：重复事件不重复结算
	}
	a.recalcGrowthProfile(userID)
}

func (a *App) growthProfile(userID uint) models.UserGrowthProfile {
	p := models.UserGrowthProfile{UserID: userID, Public: true, CurrentLevel: 1, HighestLevel: 1}
	a.DB.Where("user_id = ?", userID).First(&p)
	return p
}

// growthLevelPayload 组装等级进度（当前等级 + 下一级阈值 + 进度百分比）。
func (a *App) growthPayload(p models.UserGrowthProfile) gin.H {
	var current models.LevelDefinition
	a.DB.Where("level = ?", p.CurrentLevel).First(&current)
	var next models.LevelDefinition
	hasNext := a.DB.Where("status = ? AND min_xp > ?", "active", current.MinXP).Order("min_xp ASC").First(&next).Error == nil
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

// ---- 公开端点 ----

// GrowthSettings GET /growth/settings 模块启用状态（供前端联动）
func (a *App) GrowthSettings(c *gin.Context) {
	ok(c, gin.H{"enabled": a.pluginEnabled(pluginGrowth)})
}

// GrowthLevels GET /growth/levels 等级阶梯（公开）
func (a *App) GrowthLevels(c *gin.Context) {
	levels := []models.LevelDefinition{}
	a.DB.Where("status = ?", "active").Order("level ASC").Find(&levels)
	ok(c, gin.H{"items": levels})
}

// PublicUserGrowth GET /users/:username/growth 公开的用户等级（用户隐藏则只返回 public=false）
func (a *App) PublicUserGrowth(c *gin.Context) {
	var u models.User
	if err := a.DB.Where("username = ?", c.Param("username")).First(&u).Error; err != nil {
		fail(c, http.StatusNotFound, "用户不存在")
		return
	}
	p := a.growthProfile(u.ID)
	if !p.Public {
		ok(c, gin.H{"public": false})
		return
	}
	ok(c, a.growthPayload(p))
}

// ---- 本人端点 ----

// MyGrowth GET /users/me/growth 当前用户成长资料
func (a *App) MyGrowth(c *gin.Context) {
	u := currentUser(c)
	ok(c, a.growthPayload(a.growthProfile(u.ID)))
}

// MyExperienceEvents GET /users/me/experience-events 当前用户经验流水（分页）
func (a *App) MyExperienceEvents(c *gin.Context) {
	u := currentUser(c)
	page, pageSize := paginate(c)
	var total int64
	a.DB.Model(&models.ExperienceEvent{}).Where("user_id = ?", u.ID).Count(&total)
	events := []models.ExperienceEvent{}
	a.DB.Where("user_id = ?", u.ID).Order("created_at DESC").
		Limit(pageSize).Offset((page - 1) * pageSize).Find(&events)
	ok(c, PageResult{Items: events, Total: total, Page: page, PageSize: pageSize})
}

// UpdateMyGrowthDisplay PUT /users/me/growth/display 切换等级是否公开
func (a *App) UpdateMyGrowthDisplay(c *gin.Context) {
	u := currentUser(c)
	var req struct {
		Public bool `json:"public"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	p := a.growthProfile(u.ID)
	p.Public = req.Public
	a.DB.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "user_id"}}, UpdateAll: true}).Create(&p)
	ok(c, gin.H{"public": p.Public})
}

// ---- 管理端点 ----

// AdminListLevels GET /admin/growth/levels 全部等级（含归档）
func (a *App) AdminListLevels(c *gin.Context) {
	levels := []models.LevelDefinition{}
	a.DB.Order("level ASC").Find(&levels)
	ok(c, gin.H{"items": levels})
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

// AdminCreateLevel POST /admin/growth/levels
func (a *App) AdminCreateLevel(c *gin.Context) {
	var req levelRequest
	if err := c.ShouldBindJSON(&req); err != nil || !normalizeLevel(&req) {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	var dup int64
	a.DB.Model(&models.LevelDefinition{}).Where("level = ?", req.Level).Count(&dup)
	if dup > 0 {
		fail(c, http.StatusConflict, "等级编号已存在")
		return
	}
	lvl := models.LevelDefinition{
		Level: req.Level, Key: fmt.Sprintf("lv%d", req.Level), Name: req.Name, Description: req.Description,
		IconType: req.IconType, IconValue: req.IconValue, Color: req.Color, MinXP: req.MinXP,
		SortOrder: req.Level, Status: req.Status,
	}
	if err := a.DB.Create(&lvl).Error; err != nil {
		fail(c, http.StatusInternalServerError, "创建失败: "+err.Error())
		return
	}
	a.recordAudit(c, "growth.level_created", "growth", strconv.Itoa(req.Level), lvl.Name, changedFields("level", "min_xp"))
	ok(c, lvl)
}

// AdminUpdateLevel PUT /admin/growth/levels/:id
func (a *App) AdminUpdateLevel(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	var lvl models.LevelDefinition
	if err := a.DB.First(&lvl, id).Error; err != nil {
		fail(c, http.StatusNotFound, "等级不存在")
		return
	}
	var req levelRequest
	if err := c.ShouldBindJSON(&req); err != nil || !normalizeLevel(&req) {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if lvl.Level == 1 {
		req.MinXP = 0 // 等级 1 阈值恒为 0
	}
	if err := a.DB.Model(&lvl).Updates(map[string]any{
		"name": req.Name, "description": req.Description, "icon_type": req.IconType,
		"icon_value": req.IconValue, "color": req.Color, "min_xp": req.MinXP, "status": req.Status,
	}).Error; err != nil {
		fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
		return
	}
	a.recordAudit(c, "growth.level_updated", "growth", strconv.Itoa(lvl.Level), req.Name, changedFields("name", "min_xp", "status"))
	ok(c, lvl)
}

// AdminDeleteLevel DELETE /admin/growth/levels/:id（等级 1 不可删除）
func (a *App) AdminDeleteLevel(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	var lvl models.LevelDefinition
	if err := a.DB.First(&lvl, id).Error; err != nil {
		fail(c, http.StatusNotFound, "等级不存在")
		return
	}
	if lvl.Level == 1 {
		fail(c, http.StatusBadRequest, "等级 1 不可删除")
		return
	}
	a.DB.Delete(&lvl)
	a.recordAudit(c, "growth.level_deleted", "growth", strconv.Itoa(lvl.Level), lvl.Name, changedFields("deleted"))
	ok(c, gin.H{"message": "已删除"})
}

// AdminListExperienceRules GET /admin/growth/rules 经验规则列表
func (a *App) AdminListExperienceRules(c *gin.Context) {
	rules := []models.ExperienceRule{}
	a.DB.Order("sort_order ASC, id ASC").Find(&rules)
	ok(c, gin.H{"items": rules})
}

// AdminUpdateExperienceRule PUT /admin/growth/rules/:id 更新经验规则（base_xp / daily_cap / enabled）
func (a *App) AdminUpdateExperienceRule(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	var rule models.ExperienceRule
	if err := a.DB.First(&rule, id).Error; err != nil {
		fail(c, http.StatusNotFound, "规则不存在")
		return
	}
	var req struct {
		BaseXP   int  `json:"base_xp"`
		DailyCap int  `json:"daily_cap"`
		Enabled  bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if req.BaseXP < 0 {
		req.BaseXP = 0
	}
	if req.DailyCap < 0 {
		req.DailyCap = 0
	}
	if err := a.DB.Model(&rule).Updates(map[string]any{"base_xp": req.BaseXP, "daily_cap": req.DailyCap, "enabled": req.Enabled}).Error; err != nil {
		fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
		return
	}
	a.recordAudit(c, "growth.rule_updated", "growth", rule.RuleKey, rule.Label, changedFields("base_xp", "daily_cap", "enabled"))
	ok(c, rule)
}

// AdminAdjustExperience POST /admin/growth/adjust 人工加减经验（必须写原因，生成 adjustment 流水）
func (a *App) AdminAdjustExperience(c *gin.Context) {
	admin := currentUser(c)
	var req struct {
		Username string `json:"username"`
		XP       int    `json:"xp"`
		Reason   string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Username) == "" || req.XP == 0 || strings.TrimSpace(req.Reason) == "" {
		fail(c, http.StatusBadRequest, "请填写用户名、非零经验与原因")
		return
	}
	var target models.User
	if err := a.DB.Where("username = ?", strings.TrimSpace(req.Username)).First(&target).Error; err != nil {
		fail(c, http.StatusNotFound, "用户不存在")
		return
	}
	dedupe := fmt.Sprintf("admin.adjust:%d:%d:%d", target.ID, admin.ID, currentTime().UnixNano())
	a.RecordExperience(target.ID, "admin.adjust", "user", strconv.FormatUint(uint64(admin.ID), 10), dedupe, req.XP, strings.TrimSpace(req.Reason))
	a.recordAudit(c, "growth.experience_adjusted", "user", auditID(target.ID), target.Username, map[string]any{"xp": req.XP, "reason": req.Reason})
	ok(c, a.growthPayload(a.growthProfile(target.ID)))
}
