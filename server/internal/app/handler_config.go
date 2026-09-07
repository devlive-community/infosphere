package app

import (
	"net/http"
	"regexp"
	"strings"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

// 通用系统配置：以 key-value 形式管理任意站点配置项，供后续自由扩展。
// 底层复用 site_configs 表（config_key/config_value/description），
// 站点/邮件/存储/第三方登录等既有配置也存于此表，可在此统一查看与维护。

// configKeyPattern 约束配置键：字母数字与 . _ : -，长度 1-50（匹配列宽）
var configKeyPattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,49}$`)

// reservedConfigKeys 系统赖以运行的关键键，禁止删除（仍可改值）
var reservedConfigKeys = map[string]bool{
	"site_name":         true,
	"site_description":  true,
	"version":           true,
	"installation_date": true,
}

type configItem struct {
	Key         string `json:"key"`
	Value       string `json:"value"`
	Description string `json:"description"`
	Reserved    bool   `json:"reserved"`
	UpdatedAt   string `json:"updated_at"`
}

// AdminListConfigs GET /admin/configs 列出全部系统配置键值对
func (a *App) AdminListConfigs(c *gin.Context) {
	var rows []models.SiteConfig
	if err := a.DB.Order("config_key ASC").Find(&rows).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询失败")
		return
	}
	items := make([]configItem, 0, len(rows))
	for _, r := range rows {
		items = append(items, configItem{
			Key:         r.ConfigKey,
			Value:       r.ConfigValue,
			Description: r.Description,
			Reserved:    reservedConfigKeys[r.ConfigKey],
			UpdatedAt:   r.UpdatedAt.Format("2006-01-02 15:04"),
		})
	}
	ok(c, gin.H{"items": items})
}

type configUpsert struct {
	Key         string `json:"key"`
	Value       string `json:"value"`
	Description string `json:"description"`
}

// AdminUpsertConfig PUT /admin/configs 新增或更新一个配置键值对
func (a *App) AdminUpsertConfig(c *gin.Context) {
	var req configUpsert
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	req.Key = strings.TrimSpace(req.Key)
	if !configKeyPattern.MatchString(req.Key) {
		fail(c, http.StatusBadRequest, "配置键只能包含字母、数字与 . _ : -，且不超过 50 个字符")
		return
	}
	if len(req.Description) > 255 {
		fail(c, http.StatusBadRequest, "描述不能超过 255 个字符")
		return
	}
	var cfg models.SiteConfig
	if err := a.DB.Where("config_key = ?", req.Key).First(&cfg).Error; err != nil {
		cfg = models.SiteConfig{ConfigKey: req.Key}
	}
	cfg.ConfigValue = req.Value
	cfg.Description = req.Description
	if err := a.DB.Save(&cfg).Error; err != nil {
		fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
		return
	}
	ok(c, configItem{
		Key:         cfg.ConfigKey,
		Value:       cfg.ConfigValue,
		Description: cfg.Description,
		Reserved:    reservedConfigKeys[cfg.ConfigKey],
		UpdatedAt:   cfg.UpdatedAt.Format("2006-01-02 15:04"),
	})
}

// AdminDeleteConfig DELETE /admin/configs/:key 删除配置键（保留系统关键键）
func (a *App) AdminDeleteConfig(c *gin.Context) {
	key := c.Param("key")
	if reservedConfigKeys[key] {
		fail(c, http.StatusBadRequest, "该配置为系统关键项，禁止删除")
		return
	}
	if err := a.DB.Where("config_key = ?", key).Delete(&models.SiteConfig{}).Error; err != nil {
		fail(c, http.StatusInternalServerError, "删除失败")
		return
	}
	ok(c, gin.H{"message": "已删除"})
}
