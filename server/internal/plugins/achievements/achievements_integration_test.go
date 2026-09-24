package achievements_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"gorm.io/gorm"

	"knowforge/server/internal/app"
	"knowforge/server/internal/auth"
	"knowforge/server/internal/config"
	"knowforge/server/internal/models"
	"knowforge/server/internal/plugincore"
	"knowforge/server/internal/plugins/achievements"
)

// 集成测试：启动完整应用（安装向导），经插件管理接口启用成就插件，走真实路由/中间件/任务队列。

type testEnv struct {
	app    *app.App
	db     *gorm.DB
	admin  *models.User
	token  string
	server *httptest.Server
	client *http.Client
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()
	t.Setenv("KNOWFORGE_DATA", t.TempDir())
	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("加载配置失败: %v", err)
	}
	a, err := app.New(cfg)
	if err != nil {
		t.Fatalf("创建应用失败: %v", err)
	}
	e := &testEnv{app: a, server: httptest.NewServer(a.Router()), client: &http.Client{Timeout: 10 * time.Second}}
	t.Cleanup(e.server.Close)
	status, installed := e.do(t, http.MethodPost, "/api/v1/setup/install", `{"database":{"type":"sqlite"},"site":{"name":"成就测试"},"admin":{"username":"achievement-admin","email":"achievement-admin@test.local","password":"secret123"}}`, "")
	if status != http.StatusOK {
		t.Fatalf("安装失败: %d %v", status, installed)
	}
	e.token = installed["data"].(map[string]any)["token"].(string)
	e.db = a.DB
	e.admin = &models.User{}
	if err := e.db.Where("username = ?", "achievement-admin").First(e.admin).Error; err != nil {
		t.Fatal(err)
	}
	return e
}

func (e *testEnv) do(t *testing.T, method, path, body, token string) (int, map[string]any) {
	t.Helper()
	req, _ := http.NewRequest(method, e.server.URL+path, bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := e.client.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	payload := map[string]any{}
	_ = json.NewDecoder(resp.Body).Decode(&payload)
	return resp.StatusCode, payload
}

// enable 经插件管理接口启用插件（建表 + 权限 + 启用钩子），并清空启用时投递的任务（如成就全量重算）。
func (e *testEnv) enable(t *testing.T, key string) {
	t.Helper()
	if status, payload := e.do(t, http.MethodPost, "/api/v1/admin/plugins/"+key+"/install", "", e.token); status != http.StatusOK {
		t.Fatalf("启用插件 %s 失败: %d %v", key, status, payload)
	}
	e.drainJobs(t)
}

func (e *testEnv) drainJobs(t *testing.T) {
	t.Helper()
	for i := 0; i < 20; i++ {
		ran, err := e.app.Jobs.RunOnce(context.Background())
		if err != nil {
			t.Fatalf("执行后台任务失败: %v", err)
		}
		if !ran {
			return
		}
	}
}

func (e *testEnv) user(t *testing.T, username string) *models.User {
	t.Helper()
	u := &models.User{Username: username, Email: username + "@test.local", Role: "user", IsActive: true}
	if err := e.db.Create(u).Error; err != nil {
		t.Fatal(err)
	}
	return u
}

func (e *testEnv) tokenFor(t *testing.T, u *models.User) string {
	t.Helper()
	token, err := auth.GenerateToken(e.app.Config.Secret, u.ID, u.Username, u.Role)
	if err != nil {
		t.Fatal(err)
	}
	return token
}

func TestAchievementModuleDefaultsToDisabled(t *testing.T) {
	e := newTestEnv(t)
	settings := achievements.LoadSettings(e.app)
	if settings.Enabled {
		t.Fatal("achievement module must be disabled by default")
	}
	if !settings.PublicProfileEnabled || !settings.NotificationsEnabled || !settings.AllowUserHide || settings.ShowcaseLimit != 6 {
		t.Fatalf("unexpected achievement defaults: %+v", settings)
	}
}

func TestAchievementEvaluationCreatesProgressAndSingleGrant(t *testing.T) {
	e := newTestEnv(t)
	e.enable(t, "achievements")
	_ = e.app.SetSetting("achievements_notifications_enabled", "false", "test")
	user := e.user(t, "achievement-reader")
	book := models.Book{Title: "Achievement Book", Slug: "achievement-book", UserID: user.ID, Status: "published", IsPublic: true}
	if err := e.db.Create(&book).Error; err != nil {
		t.Fatal(err)
	}
	for index := 0; index < 3; index++ {
		doc := models.Document{BookID: book.ID, UserID: user.ID, Title: "Chapter", Slug: "achievement-chapter-" + string(rune('a'+index)), Status: "published"}
		if err := e.db.Create(&doc).Error; err != nil {
			t.Fatal(err)
		}
		if err := e.db.Create(&models.ReadChapter{UserID: user.ID, BookID: book.ID, DocID: doc.ID}).Error; err != nil {
			t.Fatal(err)
		}
	}
	definition := models.AchievementDefinition{Key: "reading.three", Name: "读完三章", Category: "reading", Status: "active", Rarity: "common", IconType: "fa", IconValue: "fa-book", RuleLogic: "all", GrantMode: "auto", Visibility: "public", ProgressMode: "aggregate", Version: 1, Tier: 1, CreatedBy: user.ID, UpdatedBy: user.ID}
	if err := e.db.Create(&definition).Error; err != nil {
		t.Fatal(err)
	}
	rule := models.AchievementRule{AchievementID: definition.ID, MetricKey: "reading.chapters_read", Operator: "gte", TargetValue: 3, WindowType: "lifetime", Filters: "{}"}
	if err := e.db.Create(&rule).Error; err != nil {
		t.Fatal(err)
	}
	definition.Rules = []models.AchievementRule{rule}
	for i := 0; i < 2; i++ {
		if err := achievements.EvaluateForUser(e.app, user.ID, definition); err != nil {
			t.Fatal(err)
		}
	}
	var progress models.UserAchievementProgress
	if err := e.db.Where("user_id = ? AND achievement_id = ?", user.ID, definition.ID).First(&progress).Error; err != nil {
		t.Fatal(err)
	}
	if progress.Percent != 100 || progress.Status != "unlocked" || progress.CurrentValue != 3 {
		t.Fatalf("unexpected progress: %+v", progress)
	}
	var grants int64
	e.db.Model(&models.UserAchievement{}).Where("user_id = ? AND achievement_id = ?", user.ID, definition.ID).Count(&grants)
	if grants != 1 {
		t.Fatalf("achievement must be granted once, got %d", grants)
	}
}

// 核心发出的业务活动 → 插件幂等地记事件并投递评估任务 → 任务执行后授予成就。
func TestAchievementEventIsDeduplicatedAndProcessed(t *testing.T) {
	e := newTestEnv(t)
	e.enable(t, "achievements")
	_ = e.app.SetSetting("achievements_notifications_enabled", "false", "test")
	user := e.user(t, "achievement-verified")
	definition := models.AchievementDefinition{Key: "account.first-day", Name: "加入一天", Category: "account", Status: "active", Rarity: "common", IconType: "fa", IconValue: "fa-user", RuleLogic: "all", GrantMode: "auto", Visibility: "public", ProgressMode: "aggregate", Version: 1, Tier: 1, CreatedBy: user.ID, UpdatedBy: user.ID}
	if err := e.db.Create(&definition).Error; err != nil {
		t.Fatal(err)
	}
	rule := models.AchievementRule{AchievementID: definition.ID, MetricKey: "account.email_verified", Operator: "gte", TargetValue: 1, WindowType: "lifetime", Filters: "{}"}
	if err := e.db.Create(&rule).Error; err != nil {
		t.Fatal(err)
	}
	if err := e.db.Model(user).Update("email_verified", true).Error; err != nil {
		t.Fatal(err)
	}
	ev := plugincore.ActivityEvent{UserID: user.ID, Type: "account.updated", SourceType: "user", SourceID: "1", DedupeKey: "account.updated:test"}
	plugincore.FireActivity(e.app, ev)
	plugincore.FireActivity(e.app, ev)
	var events, jobs int64
	e.db.Model(&models.AchievementEvent{}).Count(&events)
	e.db.Model(&models.BackgroundJob{}).Where("type = ? AND status = ?", achievements.EvaluateJobType, "pending").Count(&jobs)
	if events != 1 || jobs != 1 {
		t.Fatalf("event and job must be deduplicated: events=%d jobs=%d", events, jobs)
	}
	if ran, err := e.app.Jobs.RunOnce(context.Background()); !ran || err != nil {
		t.Fatalf("achievement event job failed: ran=%v err=%v", ran, err)
	}
	var event models.AchievementEvent
	if err := e.db.First(&event).Error; err != nil || event.ProcessedAt == nil {
		t.Fatalf("achievement event was not marked processed: %+v err=%v", event, err)
	}
	var grants int64
	e.db.Model(&models.UserAchievement{}).Where("user_id = ? AND achievement_id = ?", user.ID, definition.ID).Count(&grants)
	if grants != 1 {
		t.Fatalf("event must unlock achievement once, got %d", grants)
	}
}

func TestAchievementAdminPermissionAndPublicPayload(t *testing.T) {
	e := newTestEnv(t)
	regular := e.user(t, "achievement-regular")
	userToken := e.tokenFor(t, regular)
	// 插件未启用：管理接口挂启用守卫 → 404
	if status, _ := e.do(t, http.MethodGet, "/api/v1/admin/achievement-metrics", "", e.token); status != http.StatusNotFound {
		t.Fatalf("disabled plugin must hide achievement management, got %d", status)
	}
	e.enable(t, "achievements")
	if status, _ := e.do(t, http.MethodGet, "/api/v1/admin/achievement-metrics", "", ""); status != http.StatusUnauthorized {
		t.Fatalf("anonymous achievement management must be 401, got %d", status)
	}
	if status, _ := e.do(t, http.MethodGet, "/api/v1/admin/achievement-metrics", "", userToken); status != http.StatusForbidden {
		t.Fatalf("regular user achievement management must be 403, got %d", status)
	}
	if status, payload := e.do(t, http.MethodGet, "/api/v1/admin/achievement-metrics", "", e.token); status != http.StatusOK || payload["data"] == nil {
		t.Fatalf("admin achievement management failed: %d %v", status, payload)
	}

	definition := models.AchievementDefinition{Key: "public.safe", Name: "公开成就", Category: "special", Status: "archived", Rarity: "rare", IconType: "fa", IconValue: "fa-award", Visibility: "public", Tier: 1, CreatedBy: e.admin.ID, UpdatedBy: e.admin.ID}
	if err := e.db.Create(&definition).Error; err != nil {
		t.Fatal(err)
	}
	grant := models.UserAchievement{UserID: regular.ID, AchievementID: definition.ID, DefinitionVersion: 1, Source: "manual", GrantorID: e.admin.ID, Reason: "private admin reason", MetricsSnapshot: `{"secret":true}`, IsPublic: true, UnlockedAt: time.Now()}
	if err := e.db.Create(&grant).Error; err != nil {
		t.Fatal(err)
	}
	status, payload := e.do(t, http.MethodGet, "/api/v1/users/"+regular.Username+"/achievements", "", "")
	if status != http.StatusOK {
		t.Fatalf("public achievements failed: %d %v", status, payload)
	}
	raw, _ := json.Marshal(payload)
	if strings.Contains(string(raw), "private admin reason") || strings.Contains(string(raw), "secret") || strings.Contains(string(raw), "grantor_id") {
		t.Fatalf("public achievement payload leaked internal grant data: %s", raw)
	}
	// 我的成就（用户端）
	if status, payload := e.do(t, http.MethodGet, "/api/v1/users/me/achievements", "", userToken); status != http.StatusOK {
		t.Fatalf("my achievements failed: %d %v", status, payload)
	}
	// 多语言资源接口保持原路径
	if status, payload := e.do(t, http.MethodGet, "/api/v1/admin/i18n/resources/achievement/"+jsonID(definition.ID), "", e.token); status != http.StatusOK {
		t.Fatalf("achievement translations endpoint failed: %d %v", status, payload)
	}
	// 删除用户时插件登记的成就数据一并清理
	if status, payload := e.do(t, http.MethodDelete, "/api/v1/admin/users/"+jsonID(regular.ID), "", e.token); status != http.StatusOK {
		t.Fatalf("delete user failed: %d %v", status, payload)
	}
	var left int64
	e.db.Model(&models.UserAchievement{}).Where("user_id = ?", regular.ID).Count(&left)
	if left != 0 {
		t.Fatalf("deleting a user must remove their achievements, left %d", left)
	}
}

// 成就指标：growth.total_xp / growth.current_level / reading.books_completed / creator.published_words。
func TestAchievementMetricsAcrossPlugins(t *testing.T) {
	e := newTestEnv(t)
	e.enable(t, "achievements")
	e.enable(t, "growth")
	user := e.user(t, "achievement-metrics")

	// 成长：150 经验 → Lv.2
	plugincore.RecordExperience(e.app, user.ID, "test", "x", "1", "d1", 150, "")
	metric := func(key string) int64 {
		v, err := achievements.EvaluateMetric(e.app, user.ID, models.AchievementRule{MetricKey: key, WindowType: "lifetime"})
		if err != nil {
			t.Fatalf("metric %s: %v", key, err)
		}
		return v
	}
	if v := metric("growth.total_xp"); v != 150 {
		t.Fatalf("growth.total_xp 应为 150，实际 %d", v)
	}
	if v := metric("growth.current_level"); v != 2 {
		t.Fatalf("growth.current_level 应为 2，实际 %d", v)
	}

	book := models.Book{Title: "B", Slug: "words-book", UserID: user.ID, Status: "published", IsPublic: true}
	e.db.Create(&book)
	e.db.Create(&models.Document{BookID: book.ID, UserID: user.ID, Title: "c1", Slug: "c1", Status: "published", Content: "12345"})
	e.db.Create(&models.Document{BookID: book.ID, UserID: user.ID, Title: "c2", Slug: "c2", Status: "published", Content: "abc"})
	if v := metric("creator.published_words"); v != 8 {
		t.Fatalf("creator.published_words 应为 8，实际 %d", v)
	}
	var docs []models.Document
	e.db.Where("book_id = ?", book.ID).Find(&docs)
	for _, d := range docs {
		e.db.Create(&models.ReadChapter{UserID: user.ID, BookID: book.ID, DocID: d.ID})
	}
	if v := metric("reading.books_completed"); v != 1 {
		t.Fatalf("reading.books_completed 应为 1，实际 %d", v)
	}
}

func jsonID(id uint) string {
	raw, _ := json.Marshal(id)
	return string(raw)
}

// 撤销成就收回奖励经验；重新授予再次发放；站点配置由插件下发 achievements_enabled。
func TestAchievementRevokeReclaimsRewardXP(t *testing.T) {
	e := newTestEnv(t)
	e.enable(t, "achievements")
	e.enable(t, "growth")
	_ = e.app.SetSetting("achievements_notifications_enabled", "false", "test")
	_, site := e.do(t, http.MethodGet, "/api/v1/site", "", "")
	if site["data"].(map[string]any)["achievements_enabled"] != "true" {
		t.Fatalf("启用后站点配置应含 achievements_enabled=true: %v", site["data"])
	}
	user := e.user(t, "achievement-reward")
	definition := models.AchievementDefinition{Key: "reward.xp", Name: "奖励成就", Category: "special", Status: "active", Rarity: "rare", IconType: "fa", IconValue: "fa-award", Visibility: "public", GrantMode: "manual", RewardXP: 40, Version: 1, Tier: 1, CreatedBy: e.admin.ID, UpdatedBy: e.admin.ID}
	if err := e.db.Create(&definition).Error; err != nil {
		t.Fatal(err)
	}
	xp := func() int64 {
		var total int64
		e.db.Model(&models.ExperienceEvent{}).Where("user_id = ?", user.ID).Select("COALESCE(SUM(final_xp),0)").Scan(&total)
		return total
	}
	grantBody := `{"username":"achievement-reward","achievement_id":` + jsonID(definition.ID) + `,"reason":"活动"}`
	status, payload := e.do(t, http.MethodPost, "/api/v1/admin/achievement-grants", grantBody, e.token)
	if status != http.StatusOK || xp() != 40 {
		t.Fatalf("授予成就应奖励 40 经验: %d %v xp=%d", status, payload, xp())
	}
	grantID := jsonID(uint(payload["data"].(map[string]any)["id"].(float64)))
	if status, payload := e.do(t, http.MethodPost, "/api/v1/admin/achievement-grants/"+grantID+"/revoke", `{"reason":"误发"}`, e.token); status != http.StatusOK || xp() != 0 {
		t.Fatalf("撤销成就应收回奖励经验: %d %v xp=%d", status, payload, xp())
	}
	if status, _ := e.do(t, http.MethodPost, "/api/v1/admin/achievement-grants", grantBody, e.token); status != http.StatusOK || xp() != 40 {
		t.Fatalf("重新授予应再次奖励经验，实际 xp=%d", xp())
	}
	e.do(t, http.MethodPost, "/api/v1/admin/achievement-grants/"+grantID+"/revoke", `{"reason":"再次撤销"}`, e.token)
	if xp() != 0 {
		t.Fatalf("再次撤销应收回重新发放的经验，实际 xp=%d", xp())
	}
}
