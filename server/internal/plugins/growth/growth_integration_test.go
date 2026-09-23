package growth_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"gorm.io/gorm"

	"knowforge/server/internal/app"
	"knowforge/server/internal/config"
	"knowforge/server/internal/models"
	"knowforge/server/internal/plugincore"
	"knowforge/server/internal/plugins/growth"
)

// 集成测试：启动完整应用，经插件管理接口启用/停用成长插件（建表、权限、种子等级与经验规则）。

type testEnv struct {
	app    *app.App
	db     *gorm.DB
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
	status, installed := e.do(t, http.MethodPost, "/api/v1/setup/install", `{"database":{"type":"sqlite"},"site":{"name":"成长测试"},"admin":{"username":"growth-admin","email":"growth-admin@test.local","password":"secret123"}}`)
	if status != http.StatusOK {
		t.Fatalf("安装失败: %d %v", status, installed)
	}
	e.token = installed["data"].(map[string]any)["token"].(string)
	e.db = a.DB
	e.setPlugin(t, true)
	return e
}

func (e *testEnv) do(t *testing.T, method, path, body string) (int, map[string]any) {
	t.Helper()
	req, _ := http.NewRequest(method, e.server.URL+path, bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	if e.token != "" {
		req.Header.Set("Authorization", "Bearer "+e.token)
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

func (e *testEnv) setPlugin(t *testing.T, enabled bool) {
	t.Helper()
	action := "uninstall"
	if enabled {
		action = "install"
	}
	if status, payload := e.do(t, http.MethodPost, "/api/v1/admin/plugins/growth/"+action, ""); status != http.StatusOK {
		t.Fatalf("%s growth 插件失败: %d %v", action, status, payload)
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

// 成长等级：启用后种子等级，记账经验幂等、按阈值解析等级、升级写历史；禁用后不再结算。
func TestGrowthExperienceAndLeveling(t *testing.T) {
	e := newTestEnv(t)
	user := e.user(t, "growth-user")
	var levelCount int64
	e.db.Model(&models.LevelDefinition{}).Count(&levelCount)
	if levelCount == 0 {
		t.Fatal("启用后应种子默认等级")
	}

	plugincore.RecordExperience(e.app, user.ID, "test.grant", "x", "1", "dedupe-1", 150, "")
	if p := growth.Profile(e.app, user.ID); p.LifetimeXP != 150 || p.CurrentLevel != 2 {
		t.Fatalf("经验/等级错误：xp=%d level=%d", p.LifetimeXP, p.CurrentLevel)
	}
	plugincore.RecordExperience(e.app, user.ID, "test.grant", "x", "1", "dedupe-1", 150, "")
	if p := growth.Profile(e.app, user.ID); p.LifetimeXP != 150 {
		t.Fatalf("重复 dedupe 应不结算，实际 xp=%d", p.LifetimeXP)
	}
	plugincore.RecordExperience(e.app, user.ID, "test.grant", "x", "2", "dedupe-2", 100, "")
	p := growth.Profile(e.app, user.ID)
	if p.LifetimeXP != 250 || p.CurrentLevel != 3 || p.HighestLevel != 3 {
		t.Fatalf("升级错误：xp=%d level=%d highest=%d", p.LifetimeXP, p.CurrentLevel, p.HighestLevel)
	}
	var histCount int64
	e.db.Model(&models.UserLevelHistory{}).Where("user_id = ?", user.ID).Count(&histCount)
	if histCount < 2 {
		t.Fatalf("应有 ≥2 条升级历史，实际 %d", histCount)
	}

	e.setPlugin(t, false)
	plugincore.RecordExperience(e.app, user.ID, "test.grant", "x", "3", "dedupe-3", 100, "")
	if p := growth.Profile(e.app, user.ID); p.LifetimeXP != 250 {
		t.Fatalf("禁用后不应结算，实际 xp=%d", p.LifetimeXP)
	}
}

// 经验规则：按 base_xp 发放、执行每日上限、禁用规则不发。
func TestExperienceRuleAndDailyCap(t *testing.T) {
	e := newTestEnv(t)
	user := e.user(t, "growth-cap")
	e.db.Create(&models.ExperienceRule{RuleKey: "test.rule", Label: "T", BaseXP: 5, DailyCap: 10, Enabled: true})
	for i := 0; i < 4; i++ {
		growth.AwardExperience(e.app, user.ID, "test.rule", "x", "1", "cap-"+strconv.Itoa(i))
	}
	if p := growth.Profile(e.app, user.ID); p.LifetimeXP != 10 {
		t.Fatalf("每日上限应封顶在 10，实际 %d", p.LifetimeXP)
	}
	e.db.Model(&models.ExperienceRule{}).Where("rule_key = ?", "test.rule").Update("enabled", false)
	growth.AwardExperience(e.app, user.ID, "test.rule", "x", "1", "disabled-1")
	if p := growth.Profile(e.app, user.ID); p.LifetimeXP != 10 {
		t.Fatalf("禁用规则不应发经验，实际 %d", p.LifetimeXP)
	}
}

// 核心事件 → 经验：评论（3）、首次读章节（5）、章节发布（10），各自按去重键只结算一次。
func TestCoreEventsAwardExperience(t *testing.T) {
	e := newTestEnv(t)
	user := e.user(t, "growth-events")
	book := models.Book{Title: "G", Slug: "growth-book", UserID: user.ID, Status: "published", IsPublic: true}
	e.db.Create(&book)
	doc := models.Document{BookID: book.ID, UserID: user.ID, Title: "c1", Slug: "c1", Status: "published"}
	e.db.Create(&doc)
	docID := strconv.FormatUint(uint64(doc.ID), 10)

	comment := plugincore.ActivityEvent{UserID: user.ID, Type: "comment.created", SourceType: "comment", SourceID: "42", DedupeKey: "comment.given:42"}
	plugincore.FireActivity(e.app, comment)
	plugincore.FireActivity(e.app, comment)
	read := models.ReadChapter{UserID: user.ID, BookID: book.ID, DocID: doc.ID}
	e.db.Create(&read)
	plugincore.FireActivity(e.app, plugincore.ActivityEvent{UserID: user.ID, Type: "chapter.read", SourceType: "document", SourceID: docID, DedupeKey: "chapter.read:1"})
	plugincore.FireChapterPublished(e.app, &book, &doc)
	plugincore.FireChapterPublished(e.app, &book, &doc)

	if p := growth.Profile(e.app, user.ID); p.LifetimeXP != 3+5+10 {
		t.Fatalf("评论/读章/发布应共得 18 经验，实际 %d", p.LifetimeXP)
	}
	var keys []string
	e.db.Model(&models.ExperienceEvent{}).Where("user_id = ?", user.ID).Order("id ASC").Pluck("dedupe_key", &keys)
	want := []string{"community.comment:42", "reading.chapter:" + strconv.FormatUint(uint64(read.ID), 10), "creation.chapter_published:" + docID}
	if len(keys) != len(want) || keys[0] != want[0] || keys[1] != want[1] || keys[2] != want[2] {
		t.Fatalf("经验去重键应与迁移前一致: %v want %v", keys, want)
	}

	// 删除用户（无书籍）时一并清理其成长数据
	leaver := e.user(t, "growth-leaver")
	plugincore.RecordExperience(e.app, leaver.ID, "test.grant", "x", "1", "leaver-1", 120, "")
	if status, payload := e.do(t, http.MethodDelete, "/api/v1/admin/users/"+strconv.FormatUint(uint64(leaver.ID), 10), ""); status != http.StatusOK {
		t.Fatalf("delete user failed: %d %v", status, payload)
	}
	var left int64
	e.db.Model(&models.ExperienceEvent{}).Where("user_id = ?", leaver.ID).Count(&left)
	if left != 0 {
		t.Fatalf("删除用户后经验流水应被清理，剩余 %d", left)
	}
}
