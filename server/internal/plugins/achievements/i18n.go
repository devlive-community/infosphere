package achievements

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"knowforge/server/internal/models"
	"knowforge/server/internal/plugincore"
)

// 成就的多语言：名称/描述/锁定提示作为可翻译资源（kind=achievement），存取与语言回退由核心提供。

const resourceKind = "achievement"

func init() {
	plugincore.RegisterLocalizedResource(resourceKind, map[string]int{"name": 120, "description": 500, "locked_hint": 255})
}

func (am *behavior) prepareAchievementTranslations(req *achievementDefinitionRequest, id uint) error {
	def, err := am.core.DefaultContentLocale()
	if err != nil {
		return err
	}
	existing, err := am.core.LoadResourceTranslations(am.core.Gorm(), resourceKind, id)
	if err != nil {
		return err
	}
	if req.Translations == nil {
		// Legacy clients retain their two-language write contract during migration.
		req.Translations = map[string]plugincore.ResourceTranslation{}
		for code, fields := range map[string]map[string]string{"zh-CN": {"name": req.Name, "description": req.Description, "locked_hint": req.LockedHint}, "en": {"name": req.NameEn, "description": req.DescriptionEn, "locked_hint": req.LockedHintEn}} {
			if fields["name"] != "" {
				req.Translations[code] = plugincore.ResourceTranslation{Fields: fields, Revision: existing[code].Revision, Publish: true}
			}
		}
	}
	fields := existing[def].Published
	published := existing[def].Published
	if tr, ok := req.Translations[def]; ok {
		fields = tr.Fields
		if tr.Publish {
			published = tr.Fields
		}
	}
	if req.Status == "active" && strings.TrimSpace(published["name"]) == "" {
		return fmt.Errorf("启用成就前请发布默认语言名称")
	}
	// The compatibility cache is also used by notifications; never copy unpublished text into it.
	if published["name"] != "" {
		fields = published
	}
	if fields["name"] == "" && req.Name == "" {
		return fmt.Errorf("请填写默认语言名称")
	}
	if fields["name"] != "" {
		req.Name = fields["name"]
		req.Description = fields["description"]
		req.LockedHint = fields["locked_hint"]
	}
	return nil
}

func (am *behavior) attachAchievementTranslations(tx *gorm.DB, d *models.AchievementDefinition) error {
	translations, err := am.core.LoadResourceTranslations(tx, resourceKind, d.ID)
	if err != nil {
		return err
	}
	d.Translations, err = json.Marshal(translations)
	return err
}

// localizeAchievements 按请求语言回退链把成就文案替换为已发布翻译；有翻译记录但均未命中时显示占位「—」，
// 兼容字段（*En）一律清空，避免泄露未发布内容。
func (am *behavior) localizeAchievements(c *gin.Context, defs []models.AchievementDefinition) error {
	if len(defs) == 0 {
		return nil
	}
	ids := make([]uint, 0, len(defs))
	for _, d := range defs {
		ids = append(ids, d.ID)
	}
	resolved, _, err := am.core.LocalizeResources(c, resourceKind, ids)
	if err != nil {
		return err
	}
	for i := range defs {
		d := &defs[i]
		res := resolved[d.ID]
		values := map[string]string{"name": d.Name, "description": d.Description, "locked_hint": d.LockedHint}
		if res.HasTranslations {
			values = map[string]string{"name": "—", "description": "", "locked_hint": ""}
		}
		d.ResolvedLocale = "zh-CN"
		for _, layer := range res.Layers {
			for key, value := range layer.Fields {
				values[key] = value
			}
			if layer.Fields["name"] != "" {
				d.ResolvedLocale = layer.Locale
			}
		}
		d.Name = values["name"]
		d.Description = values["description"]
		d.LockedHint = values["locked_hint"]
		d.NameEn = ""
		d.DescriptionEn = ""
		d.LockedHintEn = "" // compatibility fields must not leak untranslated hidden content
	}
	return nil
}

// AdminResourceTranslations GET/PUT /admin/i18n/resources/achievement/:id 读取/更新成就的多语言内容。
func (am *behavior) AdminResourceTranslations(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		am.core.Fail(c, 400, "资源ID无效")
		return
	}
	var d models.AchievementDefinition
	if am.core.Gorm().First(&d, uint(id)).Error != nil {
		am.core.Fail(c, 404, "资源不存在")
		return
	}
	if c.Request.Method == http.MethodPut {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 256<<10)
		var req struct {
			Translations map[string]plugincore.ResourceTranslation `json:"translations"`
		}
		if c.ShouldBindJSON(&req) != nil || req.Translations == nil {
			am.core.Fail(c, 400, "参数错误")
			return
		}
		if err := am.core.Gorm().Transaction(func(tx *gorm.DB) error {
			if err := am.core.SaveResourceTranslations(tx, resourceKind, uint(id), am.core.CurrentUser(c).ID, req.Translations); err != nil {
				return err
			}
			result := tx.Model(&d).Where("version = ?", d.Version).Updates(map[string]any{"version": gorm.Expr("version + 1"), "updated_by": am.core.CurrentUser(c).ID})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return plugincore.ErrTranslationConflict
			}
			if err := tx.Preload("Rules").First(&d, d.ID).Error; err != nil {
				return err
			}
			return am.saveAchievementDefinitionVersion(tx, d, d.Rules, am.core.CurrentUser(c).ID)
		}); err != nil {
			status := 400
			if errors.Is(err, plugincore.ErrTranslationConflict) {
				status = 409
			}
			am.core.Fail(c, status, err.Error())
			return
		}
		am.core.RecordAudit(c, "i18n.resource_updated", resourceKind, c.Param("id"), d.Name, changedFields("translations"))
	}
	result, err := am.core.LoadResourceTranslations(am.core.Gorm(), resourceKind, uint(id))
	if err != nil {
		am.core.Fail(c, 500, "读取翻译失败")
		return
	}
	am.core.OK(c, gin.H{"translations": result})
}
