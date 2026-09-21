package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"knowforge/server/internal/auth"
	"knowforge/server/internal/config"
	"knowforge/server/internal/models"
)

func TestAchievementModuleDefaultsToDisabled(t *testing.T) {
	app, _, _ := newContentImportTestApp(t)
	settings := app.achievementSettings()
	if settings.Enabled {
		t.Fatal("achievement module must be disabled by default")
	}
	if !settings.PublicProfileEnabled || !settings.NotificationsEnabled || !settings.AllowUserHide || settings.ShowcaseLimit != 6 {
		t.Fatalf("unexpected achievement defaults: %+v", settings)
	}
}

func TestAchievementRuleValidationUsesMetricWhitelist(t *testing.T) {
	rule := achievementRuleRequest{MetricKey: "reading.chapters_read", Operator: "gte", TargetValue: 10, WindowType: "rolling_days", WindowValue: 30}
	if err := normalizeAchievementRule(&rule); err != nil {
		t.Fatalf("valid rule rejected: %v", err)
	}
	invalid := achievementRuleRequest{MetricKey: "database.raw_sql", Operator: "gte", TargetValue: 1, WindowType: "lifetime"}
	if err := normalizeAchievementRule(&invalid); err == nil {
		t.Fatal("unknown metric must be rejected")
	}
	badFilter := achievementRuleRequest{MetricKey: "reading.chapters_read", Operator: "gte", TargetValue: 1, WindowType: "lifetime", Filters: map[string]any{"sql": "DROP TABLE users"}}
	if err := normalizeAchievementRule(&badFilter); err == nil {
		t.Fatal("metric-specific filter whitelist must reject unknown keys")
	}
}

func TestAchievementEvaluationCreatesProgressAndSingleGrant(t *testing.T) {
	app, user, db := newContentImportTestApp(t)
	app.Notifications = newNotificationHub()
	if err := app.setSetting(cfgAchievementsEnabled, "true", "test"); err != nil {
		t.Fatal(err)
	}
	app.syncPluginState() // 启用成就插件：建表 + 注册权限
	if err := app.setSetting(cfgAchievementsNotifications, "false", "test"); err != nil {
		t.Fatal(err)
	}
	book := models.Book{Title: "Achievement Book", Slug: "achievement-book", UserID: user.ID, Status: "published", IsPublic: true}
	if err := db.Create(&book).Error; err != nil {
		t.Fatal(err)
	}
	for index := 0; index < 3; index++ {
		doc := models.Document{BookID: book.ID, UserID: user.ID, Title: "Chapter", Slug: "achievement-chapter-" + string(rune('a'+index)), Status: "published"}
		if err := db.Create(&doc).Error; err != nil {
			t.Fatal(err)
		}
		if err := db.Create(&models.ReadChapter{UserID: user.ID, BookID: book.ID, DocID: doc.ID}).Error; err != nil {
			t.Fatal(err)
		}
	}
	definition := models.AchievementDefinition{Key: "reading.three", Name: "读完三章", Category: "reading", Status: "active", Rarity: "common", IconType: "fa", IconValue: "fa-book", RuleLogic: "all", GrantMode: "auto", Visibility: "public", ProgressMode: "aggregate", Version: 1, Tier: 1, CreatedBy: user.ID, UpdatedBy: user.ID}
	if err := db.Create(&definition).Error; err != nil {
		t.Fatal(err)
	}
	rule := models.AchievementRule{AchievementID: definition.ID, MetricKey: "reading.chapters_read", Operator: "gte", TargetValue: 3, WindowType: "lifetime", Filters: "{}"}
	if err := db.Create(&rule).Error; err != nil {
		t.Fatal(err)
	}
	definition.Rules = []models.AchievementRule{rule}
	if err := app.evaluateAchievementForUser(user.ID, definition); err != nil {
		t.Fatal(err)
	}
	if err := app.evaluateAchievementForUser(user.ID, definition); err != nil {
		t.Fatal(err)
	}
	var progress models.UserAchievementProgress
	if err := db.Where("user_id = ? AND achievement_id = ?", user.ID, definition.ID).First(&progress).Error; err != nil {
		t.Fatal(err)
	}
	if progress.Percent != 100 || progress.Status != "unlocked" || progress.CurrentValue != 3 {
		t.Fatalf("unexpected progress: %+v", progress)
	}
	var grants int64
	if err := db.Model(&models.UserAchievement{}).Where("user_id = ? AND achievement_id = ?", user.ID, definition.ID).Count(&grants).Error; err != nil {
		t.Fatal(err)
	}
	if grants != 1 {
		t.Fatalf("achievement must be granted once, got %d", grants)
	}
}

func TestAchievementEventIsDeduplicatedAndProcessed(t *testing.T) {
	app, user, db := newContentImportTestApp(t)
	app.Config = &config.Config{Installed: true, Secret: "achievement-event-secret"}
	app.Notifications = newNotificationHub()
	if err := app.configureJobQueue(); err != nil {
		t.Fatal(err)
	}
	_ = app.setSetting(cfgAchievementsEnabled, "true", "test")
	app.syncPluginState() // 启用成就插件：建表 + 注册权限（生产由启用端点触发）
	_ = app.setSetting(cfgAchievementsNotifications, "false", "test")
	definition := models.AchievementDefinition{Key: "account.first-day", Name: "加入一天", Category: "account", Status: "active", Rarity: "common", IconType: "fa", IconValue: "fa-user", RuleLogic: "all", GrantMode: "auto", Visibility: "public", ProgressMode: "aggregate", Version: 1, Tier: 1, CreatedBy: user.ID, UpdatedBy: user.ID}
	if err := db.Create(&definition).Error; err != nil {
		t.Fatal(err)
	}
	rule := models.AchievementRule{AchievementID: definition.ID, MetricKey: "account.email_verified", Operator: "gte", TargetValue: 1, WindowType: "lifetime", Filters: "{}"}
	if err := db.Create(&rule).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(user).Update("email_verified", true).Error; err != nil {
		t.Fatal(err)
	}
	app.recordAchievementEvent(user.ID, "account.updated", "user", "1", "account.updated:test")
	app.recordAchievementEvent(user.ID, "account.updated", "user", "1", "account.updated:test")
	var events, jobs int64
	db.Model(&models.AchievementEvent{}).Count(&events)
	db.Model(&models.BackgroundJob{}).Where("type = ?", achievementEvaluateJobType).Count(&jobs)
	if events != 1 || jobs != 1 {
		t.Fatalf("event and job must be deduplicated: events=%d jobs=%d", events, jobs)
	}
	if ran, err := app.Jobs.RunOnce(context.Background()); !ran || err != nil {
		t.Fatalf("achievement event job failed: ran=%v err=%v", ran, err)
	}
	var event models.AchievementEvent
	if err := db.First(&event).Error; err != nil || event.ProcessedAt == nil {
		t.Fatalf("achievement event was not marked processed: %+v err=%v", event, err)
	}
	var grants int64
	db.Model(&models.UserAchievement{}).Where("user_id = ? AND achievement_id = ?", user.ID, definition.ID).Count(&grants)
	if grants != 1 {
		t.Fatalf("event must unlock achievement once, got %d", grants)
	}
}

func TestAchievementAdminPermissionAndPublicPayload(t *testing.T) {
	t.Setenv("KNOWFORGE_DATA", t.TempDir())
	app, regular, db := newContentImportTestApp(t)
	app.Config = &config.Config{Installed: true, Secret: "achievement-permission-secret"}
	app.Notifications = newNotificationHub()
	admin := models.User{Username: "achievement-admin", Email: "achievement-admin@test.local", Role: "admin", IsActive: true}
	if err := db.Create(&admin).Error; err != nil {
		t.Fatal(err)
	}
	regular.Role = "user"
	if err := db.Save(regular).Error; err != nil {
		t.Fatal(err)
	}
	adminToken, _ := auth.GenerateToken(app.Config.Secret, admin.ID, admin.Username, admin.Role)
	userToken, _ := auth.GenerateToken(app.Config.Secret, regular.ID, regular.Username, regular.Role)
	router := app.Router()
	// 成就为特性插件：管理接口挂启用守卫，权限校验用例需先启用插件
	_ = app.setSetting(cfgAchievementsEnabled, "true", "test")
	app.syncPluginState() // 启用成就插件：建表 + 注册权限（生产由启用端点触发）
	request := func(path, token string) (int, map[string]any) {
		recorder := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, path, nil)
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		router.ServeHTTP(recorder, req)
		payload := map[string]any{}
		_ = json.Unmarshal(recorder.Body.Bytes(), &payload)
		return recorder.Code, payload
	}
	if status, _ := request("/api/v1/admin/achievement-metrics", ""); status != http.StatusUnauthorized {
		t.Fatalf("anonymous achievement management must be 401, got %d", status)
	}
	if status, _ := request("/api/v1/admin/achievement-metrics", userToken); status != http.StatusForbidden {
		t.Fatalf("regular user achievement management must be 403, got %d", status)
	}
	if status, payload := request("/api/v1/admin/achievement-metrics", adminToken); status != http.StatusOK || payload["data"] == nil {
		t.Fatalf("admin achievement management failed: %d %v", status, payload)
	}

	_ = app.setSetting(cfgAchievementsEnabled, "true", "test")
	app.syncPluginState() // 启用成就插件：建表 + 注册权限（生产由启用端点触发）
	definition := models.AchievementDefinition{Key: "public.safe", Name: "公开成就", Category: "special", Status: "archived", Rarity: "rare", IconType: "fa", IconValue: "fa-award", Visibility: "public", Tier: 1, CreatedBy: admin.ID, UpdatedBy: admin.ID}
	if err := db.Create(&definition).Error; err != nil {
		t.Fatal(err)
	}
	grant := models.UserAchievement{UserID: regular.ID, AchievementID: definition.ID, DefinitionVersion: 1, Source: "manual", GrantorID: admin.ID, Reason: "private admin reason", MetricsSnapshot: `{"secret":true}`, IsPublic: true, UnlockedAt: currentTime()}
	if err := db.Create(&grant).Error; err != nil {
		t.Fatal(err)
	}
	status, payload := request("/api/v1/users/"+regular.Username+"/achievements", "")
	if status != http.StatusOK {
		t.Fatalf("public achievements failed: %d %v", status, payload)
	}
	raw, _ := json.Marshal(payload)
	if strings.Contains(string(raw), "private admin reason") || strings.Contains(string(raw), "secret") || strings.Contains(string(raw), "grantor_id") {
		t.Fatalf("public achievement payload leaked internal grant data: %s", raw)
	}
}

func TestSanitizeAchievementSVG(t *testing.T) {
	safe := []byte(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><path fill="url(#g)" d="M1 1h22v22z"/></svg>`)
	clean, err := sanitizeAchievementSVG(safe)
	if err != nil {
		t.Fatalf("safe SVG rejected: %v", err)
	}
	if !strings.Contains(string(clean), "<svg") || strings.Contains(string(clean), "<?xml") {
		t.Fatalf("unexpected sanitized SVG: %s", clean)
	}
	for _, malicious := range [][]byte{
		[]byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`),
		[]byte(`<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><path d="M0 0"/></svg>`),
		[]byte(`<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>bad</div></foreignObject></svg>`),
		[]byte(`<svg xmlns="http://www.w3.org/2000/svg"><path fill="url(https://evil.test/x)" d="M0 0"/></svg>`),
	} {
		if _, err := sanitizeAchievementSVG(malicious); err == nil {
			t.Fatalf("malicious SVG must be rejected: %s", malicious)
		}
	}
}
