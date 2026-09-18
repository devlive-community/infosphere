package app

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"gorm.io/gorm"
	"infosphere/server/internal/auth"
	"infosphere/server/internal/config"
	"infosphere/server/internal/models"
)

func TestDynamicI18nWorkflow(t *testing.T) {
	t.Setenv("INFO_SPHERE_DATA", t.TempDir())
	a, owner, db := newContentImportTestApp(t)
	a.Config = &config.Config{Installed: true, Secret: "i18n-test-secret"}
	a.Notifications = newNotificationHub()
	if err := a.setSetting(cfgAchievementsEnabled, "true", "test"); err != nil {
		t.Fatal(err)
	}
	owner.Role = "admin"
	if err := db.Save(owner).Error; err != nil {
		t.Fatal(err)
	}
	token, _ := auth.GenerateToken(a.Config.Secret, owner.ID, owner.Username, "admin")
	user := models.User{Username: "i18n-reader", Email: "i18n-reader@test.local", Role: "user", IsActive: true}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	userToken, _ := auth.GenerateToken(a.Config.Secret, user.ID, user.Username, "user")
	router := a.Router()
	request := func(method, path string, body any, token string) (int, map[string]any) {
		t.Helper()
		raw, _ := json.Marshal(body)
		r := httptest.NewRequest(method, path, bytes.NewReader(raw))
		r.Header.Set("Content-Type", "application/json")
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		var payload map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &payload); err != nil {
			t.Fatalf("invalid JSON %d: %s", w.Code, w.Body.String())
		}
		return w.Code, payload
	}
	for _, c := range []struct {
		token  string
		status int
	}{{"", 401}, {userToken, 403}} {
		if status, _ := request("GET", "/api/v1/admin/i18n/locales", nil, c.token); status != c.status {
			t.Fatalf("permissions: %d", status)
		}
	}
	locales, _ := a.siteLocales()
	locales = append(locales, models.SiteLocale{Code: "ja", NativeName: "日本語", Direction: "ltr", Enabled: true, ContentEnabled: true, FallbackLocale: "en"})
	body := map[string]any{"items": locales, "revision": 1}
	if status, p := request("PUT", "/api/v1/admin/i18n/locales", body, token); status != 200 {
		t.Fatalf("add locale: %d %v", status, p)
	}
	if status, _ := request("PUT", "/api/v1/admin/i18n/locales", body, token); status != 409 {
		t.Fatalf("stale registry must conflict: %d", status)
	}
	// No UI pack is required to author content in Japanese.
	_, reg := request("GET", "/api/v1/i18n/locales?locale=ja", nil, "")
	if reg["data"].(map[string]any)["locale"] != "ja" {
		t.Fatal(reg)
	}
	defBody := map[string]any{"key": "i18n-first", "status": "active", "grant_mode": "manual", "translations": map[string]any{
		"zh-CN": map[string]any{"fields": map[string]string{"name": "中文成就", "description": "默认说明"}, "publish": true},
		"ja":    map[string]any{"fields": map[string]string{"name": "日本語の実績", "description": ""}, "publish": true},
	}}
	status, created := request("POST", "/api/v1/admin/achievements", defBody, token)
	if status != 200 {
		t.Fatalf("create: %d %v", status, created)
	}
	id := uint(created["data"].(map[string]any)["id"].(float64))
	grant := models.UserAchievement{UserID: user.ID, AchievementID: id, IsPublic: true, UnlockedAt: currentTime(), DefinitionVersion: 1, Source: "manual"}
	if err := db.Create(&grant).Error; err != nil {
		t.Fatal(err)
	}
	path := "/api/v1/users/" + user.Username + "/achievements?locale=ja"
	checkName := func(expected string) {
		t.Helper()
		status, p := request("GET", path, nil, "")
		if status != 200 {
			t.Fatal(p)
		}
		item := p["data"].(map[string]any)["items"].([]any)[0].(map[string]any)["achievement"].(map[string]any)
		if item["name"] != expected {
			t.Fatalf("name %v expected %s", item["name"], expected)
		}
		raw, _ := json.Marshal(p)
		if strings.Contains(string(raw), "translations") || strings.Contains(string(raw), "draft-secret") {
			t.Fatal("draft leaked")
		}
	}
	checkName("日本語の実績")
	if err := db.Transaction(func(tx *gorm.DB) error {
		return saveResourceTranslations(tx, "achievement", id, owner.ID, map[string]resourceTranslation{"ja": {Fields: map[string]string{"name": "draft-secret"}, Revision: 1}})
	}); err != nil {
		t.Fatal(err)
	}
	checkName("日本語の実績")
	if err := db.Transaction(func(tx *gorm.DB) error {
		return saveResourceTranslations(tx, "achievement", id, owner.ID, map[string]resourceTranslation{"ja": {Fields: map[string]string{"name": "stale"}, Revision: 1, Publish: true}})
	}); err != errTranslationConflict {
		t.Fatalf("stale edit: %v", err)
	}
	translations, _ := loadResourceTranslations(db, "achievement", id)
	if translations["zh-CN"].Published["name"] != "中文成就" {
		t.Fatal("other language overwritten")
	}
	// Legacy data migration is repeat-safe, including after drafts have changed.
	if err := models.SeedI18n(db); err != nil {
		t.Fatal(err)
	}
	checkName("日本語の実績")
	if status, _ := request("PUT", "/api/v1/auth/locale", map[string]string{"locale": "ja"}, userToken); status != 200 {
		t.Fatal("preference failed")
	}
	_, preferred := request("GET", "/api/v1/i18n/locales", nil, userToken)
	if preferred["data"].(map[string]any)["locale"] != "ja" {
		t.Fatal("preference ignored")
	}
	// UI drafts never alter the published package.
	body = map[string]any{"messages": map[string]string{"common.actions.save": "Store"}, "publish": true, "revision": 0}
	if status, p := request("PUT", "/api/v1/admin/i18n/messages/en", body, token); status != 200 {
		t.Fatalf("bundle %v", p)
	}
	body["messages"] = map[string]string{"common.actions.save": "draft-secret"}
	body["publish"] = false
	body["revision"] = 1
	if status, _ := request("PUT", "/api/v1/admin/i18n/messages/en", body, token); status != 200 {
		t.Fatal("draft failed")
	}
	_, p := request("GET", "/api/v1/i18n/messages/en", nil, "")
	raw, _ := json.Marshal(p)
	if strings.Contains(string(raw), "draft-secret") || !strings.Contains(string(raw), "Store") {
		t.Fatal(string(raw))
	}
}

func TestLocaleFallbackValidation(t *testing.T) {
	rows := []models.SiteLocale{
		{Code: "zh-CN", NativeName: "中文", Direction: "ltr", Enabled: true, ContentEnabled: true, UIEnabled: true, IsDefault: true},
		{Code: "en", NativeName: "English", Direction: "ltr", Enabled: true, FallbackLocale: "zh-CN"},
		{Code: "ja", NativeName: "日本語", Direction: "ltr", Enabled: true, FallbackLocale: "en"},
	}
	if err := validateLocales(rows); err != nil {
		t.Fatal(err)
	}
	chain := localeChain("ja-JP", rows)
	if strings.Join(chain, ",") != "ja,en,zh-CN" {
		t.Fatalf("chain: %v", chain)
	}
	rows[0].FallbackLocale = "ja"
	if validateLocales(rows) == nil {
		t.Fatal("fallback cycle accepted")
	}
}

func TestLegacyAchievementLocaleMigration(t *testing.T) {
	a, user, db := newContentImportTestApp(t)
	d := models.AchievementDefinition{Key: "legacy-i18n", Name: "旧中文", NameEn: "Legacy English", CreatedBy: user.ID, UpdatedBy: user.ID}
	if err := db.Create(&d).Error; err != nil {
		t.Fatal(err)
	}
	db.Model(&models.I18nConfig{}).Where("id = 1").Update("content_migrated", false)
	if err := models.SeedI18n(db); err != nil {
		t.Fatal(err)
	}
	rows, err := loadResourceTranslations(a.DB, "achievement", d.ID)
	if err != nil {
		t.Fatal(err)
	}
	if rows["zh-CN"].Published["name"] != "旧中文" || rows["en"].Published["name"] != "Legacy English" {
		t.Fatal(rows)
	}
}
