package app

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"golang.org/x/text/language"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"knowforge/server/internal/models"
	"knowforge/server/internal/plugincore"
)

var errTranslationConflict = plugincore.ErrTranslationConflict

func canonicalLocale(raw string) (string, error) {
	if raw == "zh" {
		return "zh-CN", nil
	} // compatibility with existing preference cookies
	if len(raw) > 64 || strings.TrimSpace(raw) == "" {
		return "", fmt.Errorf("语言代码无效")
	}
	tag, err := language.Parse(raw)
	if err != nil || tag == language.Und {
		return "", fmt.Errorf("语言代码无效")
	}
	return tag.String(), nil
}

func (a *App) siteLocales() ([]models.SiteLocale, error) {
	rows := []models.SiteLocale{}
	err := a.DB.Order("sort_order ASC, code ASC").Find(&rows).Error
	return rows, err
}

func defaultLocale(rows []models.SiteLocale) string {
	for _, r := range rows {
		if r.IsDefault {
			return r.Code
		}
	}
	return "zh-CN"
}

// Fallback follows configured languages and linguistic parents, with a cycle guard.
func localeChain(code string, rows []models.SiteLocale) []string {
	registry := map[string]models.SiteLocale{}
	for _, r := range rows {
		registry[r.Code] = r
	}
	seen := map[string]bool{}
	chain := []string{}
	var visit func(string)
	visit = func(c string) {
		if c == "" || seen[c] {
			return
		}
		seen[c] = true
		if r, ok := registry[c]; ok && r.Enabled {
			chain = append(chain, c)
		}
		if i := strings.LastIndex(c, "-"); i > 0 {
			visit(c[:i])
		}
		if r, ok := registry[c]; ok {
			visit(r.FallbackLocale)
		}
	}
	visit(code)
	visit(defaultLocale(rows))
	return chain
}

func (a *App) requestLocale(c *gin.Context, rows []models.SiteLocale) string {
	candidates := []string{c.Query("locale"), c.GetHeader("X-KnowForge-Locale")}
	if u := currentUser(c); u != nil {
		candidates = append(candidates, u.PreferredLocale)
	}
	cookie, _ := c.Cookie("knowforge_locale")
	candidates = append(candidates, cookie)
	tags, _, _ := language.ParseAcceptLanguage(c.GetHeader("Accept-Language"))
	for _, tag := range tags {
		candidates = append(candidates, tag.String())
	}
	for _, candidate := range candidates {
		code, err := canonicalLocale(candidate)
		if err != nil {
			continue
		}
		for code != "" {
			for _, r := range rows {
				if r.Code == code && r.Enabled {
					return code
				}
			}
			i := strings.LastIndex(code, "-")
			if i < 0 {
				break
			}
			code = code[:i]
		}
	}
	return defaultLocale(rows)
}

func (a *App) I18nLocales(c *gin.Context) {
	rows, err := a.siteLocales()
	if err != nil {
		fail(c, 500, "读取语言配置失败")
		return
	}
	public := []models.SiteLocale{}
	for _, r := range rows {
		if r.Enabled {
			public = append(public, r)
		}
	}
	c.Header("Cache-Control", "no-store")
	ok(c, gin.H{"items": public, "default_locale": defaultLocale(rows), "locale": a.requestLocale(c, rows)})
}

func (a *App) AdminI18nLocales(c *gin.Context) {
	rows, err := a.siteLocales()
	if err != nil {
		fail(c, 500, "读取语言配置失败")
		return
	}
	var cfg models.I18nConfig
	if a.DB.First(&cfg, 1).Error != nil {
		fail(c, 500, "读取语言版本失败")
		return
	}
	ok(c, gin.H{"items": rows, "revision": cfg.Revision})
}

func validateLocales(rows []models.SiteLocale) error {
	if len(rows) == 0 || len(rows) > 100 {
		return fmt.Errorf("语言数量应为 1-100")
	}
	codes := map[string]models.SiteLocale{}
	defaults := 0
	for i := range rows {
		code, err := canonicalLocale(rows[i].Code)
		if err != nil {
			return err
		}
		rows[i].Code = code
		if _, ok := codes[code]; ok {
			return fmt.Errorf("语言代码重复")
		}
		if rows[i].NativeName == "" || utf8.RuneCountInString(rows[i].NativeName) > 100 {
			return fmt.Errorf("语言名称不能为空且不能超过100字符")
		}
		if rows[i].Direction != "ltr" && rows[i].Direction != "rtl" {
			return fmt.Errorf("文字方向无效")
		}
		if rows[i].IsDefault {
			defaults++
			if !rows[i].Enabled || !rows[i].UIEnabled || !rows[i].ContentEnabled {
				return fmt.Errorf("默认语言必须启用界面和内容")
			}
		}
		if rows[i].FallbackLocale != "" {
			fallback, err := canonicalLocale(rows[i].FallbackLocale)
			if err != nil {
				return err
			}
			rows[i].FallbackLocale = fallback
		}
		codes[code] = rows[i]
	}
	if defaults != 1 {
		return fmt.Errorf("必须有且只有一种默认语言")
	}
	for _, r := range rows {
		seen := map[string]bool{r.Code: true}
		next := r.FallbackLocale
		for next != "" {
			if seen[next] {
				return fmt.Errorf("回退语言存在循环")
			}
			seen[next] = true
			parent, ok := codes[next]
			if !ok || !parent.Enabled {
				return fmt.Errorf("回退语言必须存在且启用")
			}
			next = parent.FallbackLocale
		}
	}
	return nil
}

func (a *App) AdminSaveI18nLocales(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 128<<10)
	var req struct {
		Items    []models.SiteLocale `json:"items"`
		Revision int                 `json:"revision"`
	}
	if c.ShouldBindJSON(&req) != nil {
		fail(c, 400, "参数错误")
		return
	}
	if err := validateLocales(req.Items); err != nil {
		fail(c, 400, err.Error())
		return
	}
	err := a.DB.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&models.I18nConfig{}).Where("id = 1 AND revision = ?", req.Revision).Update("revision", gorm.Expr("revision + 1"))
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errTranslationConflict
		}
		old := []models.SiteLocale{}
		if err := tx.Find(&old).Error; err != nil {
			return err
		}
		codes := map[string]bool{}
		for _, r := range req.Items {
			codes[r.Code] = true
		}
		for _, r := range old {
			if !codes[r.Code] {
				return fmt.Errorf("已有语言不能删除，请停用以保留历史翻译")
			}
		}
		for _, r := range req.Items {
			if err := tx.Clauses(clause.OnConflict{UpdateAll: true}).Create(&r).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		status := 400
		if errors.Is(err, errTranslationConflict) {
			status = 409
		}
		fail(c, status, err.Error())
		return
	}
	a.recordAudit(c, "i18n.locales_updated", "i18n", "locales", "语言配置", changedFields("locales"))
	a.AdminI18nLocales(c)
}

func decodeMessages(raw string) map[string]string {
	result := map[string]string{}
	_ = json.Unmarshal([]byte(raw), &result)
	return result
}

func (a *App) I18nMessages(c *gin.Context) {
	rows, err := a.siteLocales()
	if err != nil {
		fail(c, 500, "读取语言失败")
		return
	}
	code, err := canonicalLocale(c.Param("locale"))
	if err != nil {
		fail(c, 400, err.Error())
		return
	}
	found := false
	for _, r := range rows {
		if r.Code == code && r.Enabled {
			found = true
		}
	}
	if !found {
		fail(c, 404, "语言未启用")
		return
	}
	chain := localeChain(code, rows)
	uiChain := []string{}
	for _, candidate := range chain {
		for _, row := range rows {
			if row.Code == candidate && row.UIEnabled {
				uiChain = append(uiChain, candidate)
			}
		}
	}
	chain = uiChain
	bundles := []models.UIMessageBundle{}
	if err := a.DB.Where("locale IN ?", chain).Find(&bundles).Error; err != nil {
		fail(c, 500, "读取语言包失败")
		return
	}
	byLocale := map[string]map[string]string{}
	for _, r := range bundles {
		for _, locale := range rows {
			if locale.Code == r.Locale && locale.UIEnabled {
				byLocale[r.Locale] = decodeMessages(r.Published)
			}
		}
	}
	// Return per-language dictionaries so built-in text participates in the same fallback order.
	result := gin.H{"locale": code, "chain": chain, "messages": byLocale}
	raw, _ := json.Marshal(result)
	etag := fmt.Sprintf("\"%x\"", sha256.Sum256(raw))
	c.Header("ETag", etag)
	c.Header("Content-Language", code)
	c.Header("Cache-Control", "public, max-age=0, must-revalidate")
	if c.GetHeader("If-None-Match") == etag {
		c.Status(304)
		return
	}
	ok(c, result)
}

func (a *App) AdminI18nMessages(c *gin.Context) {
	code, err := canonicalLocale(c.Param("locale"))
	if err != nil {
		fail(c, 400, err.Error())
		return
	}
	var locale models.SiteLocale
	if a.DB.First(&locale, "code = ?", code).Error != nil {
		fail(c, 404, "语言不存在")
		return
	}
	row := models.UIMessageBundle{Locale: code}
	if err := a.DB.Where("locale = ?", code).Find(&row).Error; err != nil {
		fail(c, 500, "读取语言包失败")
		return
	}
	ok(c, gin.H{"locale": code, "revision": row.Revision, "draft": decodeMessages(row.Draft), "published": decodeMessages(row.Published)})
}

func (a *App) AdminSaveI18nMessages(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 2<<20)
	code, err := canonicalLocale(c.Param("locale"))
	if err != nil {
		fail(c, 400, err.Error())
		return
	}
	var locale models.SiteLocale
	if a.DB.First(&locale, "code = ?", code).Error != nil {
		fail(c, 404, "语言不存在")
		return
	}
	var req struct {
		Messages map[string]string `json:"messages"`
		Revision int               `json:"revision"`
		Publish  bool              `json:"publish"`
	}
	if c.ShouldBindJSON(&req) != nil || req.Messages == nil || len(req.Messages) > 10000 {
		fail(c, 400, "语言包格式无效")
		return
	}
	for k, v := range req.Messages {
		if len(k) == 0 || len(k) > 200 || len(v) > 16000 {
			fail(c, 400, "消息长度超限")
			return
		}
	}
	raw, _ := json.Marshal(req.Messages)
	err = a.DB.Transaction(func(tx *gorm.DB) error {
		row := models.UIMessageBundle{Locale: code, Revision: 0}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&row).Error; err != nil {
			return err
		}
		values := map[string]any{"draft": string(raw), "revision": gorm.Expr("revision + 1"), "updated_by": currentUser(c).ID}
		if req.Publish {
			values["published"] = string(raw)
		}
		result := tx.Model(&row).Where("revision = ?", req.Revision).Updates(values)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errTranslationConflict
		}
		return nil
	})
	if err != nil {
		if errors.Is(err, errTranslationConflict) {
			fail(c, 409, err.Error())
		} else {
			fail(c, 500, "保存语言包失败")
		}
		return
	}
	a.recordAudit(c, "i18n.messages_updated", "i18n", code, "语言包", map[string]any{"published": req.Publish})
	a.AdminI18nMessages(c)
}

func (a *App) UpdateUserLocale(c *gin.Context) {
	var req struct {
		Locale string `json:"locale"`
	}
	if c.ShouldBindJSON(&req) != nil {
		fail(c, 400, "参数错误")
		return
	}
	code, err := canonicalLocale(req.Locale)
	if err != nil {
		fail(c, 400, err.Error())
		return
	}
	var row models.SiteLocale
	if a.DB.Where("code = ? AND enabled = ?", code, true).First(&row).Error != nil {
		fail(c, 400, "语言未启用")
		return
	}
	if a.DB.Model(&models.User{}).Where("id = ?", currentUser(c).ID).Update("preferred_locale", code).Error != nil {
		fail(c, 500, "保存语言偏好失败")
		return
	}
	c.SetCookie("knowforge_locale", code, 365*24*3600, "/", "", false, false)
	ok(c, gin.H{"locale": code})
}

// resourceTranslation 可翻译资源的一种语言；资源类型与字段白名单由插件经 plugincore.RegisterLocalizedResource 登记
// （schema 由代码拥有，管理员的任意字段不会成为可执行行为）。
type resourceTranslation = plugincore.ResourceTranslation

func loadResourceTranslations(db *gorm.DB, kind string, id uint) (map[string]resourceTranslation, error) {
	rows := []models.LocalizedResourceContent{}
	err := db.Where("resource_type = ? AND resource_id = ?", kind, id).Find(&rows).Error
	result := map[string]resourceTranslation{}
	for _, r := range rows {
		result[r.Locale] = resourceTranslation{Fields: decodeMessages(r.Draft), Published: decodeMessages(r.Published), Revision: r.Revision}
	}
	return result, err
}

func saveResourceTranslations(tx *gorm.DB, kind string, id, actor uint, translations map[string]resourceTranslation) error {
	schema, ok := plugincore.LocalizedResourceFields(kind)
	if !ok {
		return fmt.Errorf("资源类型不支持翻译")
	}
	for rawCode, input := range translations {
		code, err := canonicalLocale(rawCode)
		if err != nil || code != rawCode {
			return fmt.Errorf("请使用规范化语言代码")
		}
		var locale models.SiteLocale
		if tx.First(&locale, "code = ?", code).Error != nil {
			return fmt.Errorf("语言不存在")
		}
		if !locale.Enabled || !locale.ContentEnabled {
			return fmt.Errorf("内容语言未启用")
		}
		if input.Fields == nil {
			return fmt.Errorf("翻译字段不能为空")
		}
		for key, value := range input.Fields {
			limit, ok := schema[key]
			if !ok || utf8.RuneCountInString(value) > limit {
				return fmt.Errorf("翻译字段或长度无效")
			}
		}
		if input.Publish && strings.TrimSpace(input.Fields["name"]) == "" {
			return fmt.Errorf("发布翻译前请填写名称")
		}
		row := models.LocalizedResourceContent{ResourceType: kind, ResourceID: id, Locale: code}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&row).Error; err != nil {
			return err
		}
		raw, _ := json.Marshal(input.Fields)
		values := map[string]any{"draft": string(raw), "revision": gorm.Expr("revision + 1"), "updated_by": actor}
		if input.Publish {
			values["published"] = string(raw)
		}
		result := tx.Model(&models.LocalizedResourceContent{}).Where("resource_type = ? AND resource_id = ? AND locale = ? AND revision = ?", kind, id, code, input.Revision).Updates(values)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errTranslationConflict
		}
	}
	return nil
}

// localizeResources 按请求语言回退链解析一组资源的已发布翻译（未启用内容翻译的语言视为空层），
// 并设置 Content-Language / 禁止缓存响应头。返回请求语言代码。
func (a *App) localizeResources(c *gin.Context, kind string, ids []uint) (map[uint]plugincore.LocalizedResource, string, error) {
	result := map[uint]plugincore.LocalizedResource{}
	if len(ids) == 0 {
		return result, "", nil
	}
	locales, err := a.siteLocales()
	if err != nil {
		return nil, "", err
	}
	code := a.requestLocale(c, locales)
	chain := localeChain(code, locales)
	rows := []models.LocalizedResourceContent{}
	if err := a.DB.Where("resource_type = ? AND resource_id IN ?", kind, ids).Find(&rows).Error; err != nil {
		return nil, "", err
	}
	byID := map[uint]map[string]map[string]string{}
	contentLocales := map[string]bool{}
	for _, locale := range locales {
		contentLocales[locale.Code] = locale.Enabled && locale.ContentEnabled
	}
	for _, r := range rows {
		if byID[r.ResourceID] == nil {
			byID[r.ResourceID] = map[string]map[string]string{}
		}
		if contentLocales[r.Locale] {
			byID[r.ResourceID][r.Locale] = decodeMessages(r.Published)
		} else {
			byID[r.ResourceID][r.Locale] = map[string]string{}
		}
	}
	for _, id := range ids {
		res := plugincore.LocalizedResource{HasTranslations: len(byID[id]) > 0}
		for j := len(chain) - 1; j >= 0; j-- {
			if fields := byID[id][chain[j]]; len(fields) > 0 {
				res.Layers = append(res.Layers, plugincore.LocalizedLayer{Locale: chain[j], Fields: fields})
			}
		}
		result[id] = res
	}
	c.Header("Content-Language", code)
	c.Header("Cache-Control", "private, no-store")
	return result, code, nil
}
