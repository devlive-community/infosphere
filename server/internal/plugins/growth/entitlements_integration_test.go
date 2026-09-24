package growth_test

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"strconv"
	"testing"

	"knowforge/server/internal/auth"
	"knowforge/server/internal/models"
	"knowforge/server/internal/plugincore"
)

func (e *testEnv) upload(t *testing.T, u *models.User, size int) int {
	t.Helper()
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	part, _ := w.CreateFormFile("file", "a.png")
	_, _ = part.Write(bytes.Repeat([]byte{0x89}, size))
	_ = w.Close()
	req, _ := http.NewRequest(http.MethodPost, e.server.URL+"/api/v1/upload", &body)
	req.Header.Set("Content-Type", w.FormDataContentType())
	token, _ := auth.GenerateToken(e.app.Config.Secret, u.ID, u.Username, u.Role)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := e.client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	return resp.StatusCode
}

// 权益：默认不额外限制；管理员收紧基础值后生效；等级权益累计放宽；/auth/me 下发生效值；管理员不受限。
func TestLevelEntitlements(t *testing.T) {
	e := newTestEnv(t)
	u := e.user(t, "ent-user")
	e.db.Model(u).Update("email_verified", true)
	u.EmailVerified = true
	createBook := func(who *models.User, title string) int {
		status, _ := e.doAs(t, who, http.MethodPost, "/api/v1/books", `{"title":"`+title+`"}`)
		return status
	}

	// 默认：书籍不限
	for i := 0; i < 3; i++ {
		if status := createBook(u, "free-"+strconv.Itoa(i)); status != http.StatusOK {
			t.Fatalf("默认不应限制书籍数量，第 %d 本失败: %d", i+1, status)
		}
	}
	// 管理员收紧：基础最多 3 本、协作者 1 人、上传 1MB、关闭整站采集
	if status, payload := e.do(t, http.MethodPut, "/api/v1/admin/entitlements/base", `{"values":{"books.max":3,"collaborators.max":1,"upload.max_mb":1,"collect.site":0}}`); status != http.StatusOK {
		t.Fatalf("保存基础权益失败: %d %v", status, payload)
	}
	if status, _ := e.do(t, http.MethodPut, "/api/v1/admin/entitlements/base", `{"values":{"books.max":-5}}`); status != http.StatusBadRequest {
		t.Fatalf("非法的权益值应 400，实际 %d", status)
	}
	if status := createBook(u, "over"); status != http.StatusForbidden {
		t.Fatalf("超过书籍上限应 403，实际 %d", status)
	}
	if status := e.upload(t, u, 2<<20); status != http.StatusBadRequest {
		t.Fatalf("超过上传上限应被拒绝，实际 %d", status)
	}
	if status, _ := e.doAs(t, u, http.MethodPost, "/api/v1/collect/site/preview", `{"url":"http://127.0.0.1/"}`); status != http.StatusForbidden {
		t.Fatalf("无整站采集权益应 403，实际 %d", status)
	}
	// 公开站点配置（内容采集插件提供）：全站开关随基础值联动，游客据此显示采集入口
	status, payload := e.do(t, http.MethodGet, "/api/v1/site", "")
	site, _ := payload["data"].(map[string]any)
	if status != http.StatusOK || site["collect_site_enabled"] != false || site["collect_page_enabled"] != true {
		t.Fatalf("/site 应下发采集开关（整站关、单页开），实际 %d %v", status, payload)
	}

	// 协作者上限（按书籍所有者的权益）：1 人
	var book models.Book
	e.db.Where("user_id = ?", u.ID).First(&book)
	e.user(t, "ent-c1")
	e.user(t, "ent-c2")
	path := "/api/v1/books/" + strconv.FormatUint(uint64(book.ID), 10) + "/collaborators"
	if status, payload := e.doAs(t, u, http.MethodPost, path, `{"username":"ent-c1","role":"editor"}`); status != http.StatusOK {
		t.Fatalf("邀请第 1 位协作者失败: %d %v", status, payload)
	}
	if status, _ := e.doAs(t, u, http.MethodPost, path, `{"username":"ent-c2","role":"editor"}`); status != http.StatusForbidden {
		t.Fatalf("超过协作者上限应 403，实际 %d", status)
	}
	if status, _ := e.doAs(t, u, http.MethodPost, path, `{"username":"ent-c1","role":"viewer"}`); status != http.StatusOK {
		t.Fatalf("调整现有协作者角色不受上限限制，实际 %d", status)
	}

	// 等级权益：Lv.2 书籍 5 本、上传 5MB、开放整站采集；Lv.3 协作者 3 人（累计）
	levelID := func(level int) string {
		var lvl models.LevelDefinition
		e.db.Where("level = ?", level).First(&lvl)
		return strconv.FormatUint(uint64(lvl.ID), 10)
	}
	put := func(level int, ent string) {
		body := `{"level":` + strconv.Itoa(level) + `,"name":"Lv.` + strconv.Itoa(level) + `","icon_type":"fa","icon_value":"fa-star","min_xp":` + map[int]string{2: "100", 3: "250"}[level] + `,"status":"active","entitlements":` + ent + `}`
		if status, payload := e.do(t, http.MethodPut, "/api/v1/admin/growth/levels/"+levelID(level), body); status != http.StatusOK {
			t.Fatalf("保存等级权益失败: %d %v", status, payload)
		}
	}
	put(2, `{"books.max":5,"upload.max_mb":5,"collect.site":1}`)
	put(3, `{"collaborators.max":3}`)
	if status, _ := e.do(t, http.MethodPut, "/api/v1/admin/growth/levels/"+levelID(2), `{"level":2,"name":"Lv.2","icon_type":"fa","icon_value":"fa-star","min_xp":100,"status":"active","entitlements":{"unknown.key":1}}`); status != http.StatusBadRequest {
		t.Fatalf("未知权益键应 400，实际 %d", status)
	}
	plugincore.RecordExperience(e.app, u.ID, "test.grant", "x", "1", "ent-xp", 300, "") // → Lv.3

	_, me := e.doAs(t, u, http.MethodGet, "/api/v1/auth/me", "")
	ent := me["data"].(map[string]any)["entitlements"].(map[string]any)
	if ent["books.max"].(float64) != 5 || ent["collaborators.max"].(float64) != 3 || ent["upload.max_mb"].(float64) != 5 || ent["collect.site"].(float64) != 1 || ent["collect.page"].(float64) != 1 {
		t.Fatalf("Lv.3 用户应累计获得 Lv.2/Lv.3 的权益: %v", ent)
	}
	_, mine := e.doAs(t, u, http.MethodGet, "/api/v1/users/me/entitlements", "")
	sources := map[string]string{}
	for _, it := range mine["data"].(map[string]any)["items"].([]any) {
		r := it.(map[string]any)
		sources[r["key"].(string)] = r["source"].(string)
	}
	if sources["books.max"] != "level" || sources["collect.page"] != "base" {
		t.Fatalf("权益来源错误: %v", sources)
	}
	if status := createBook(u, "level-book"); status != http.StatusOK {
		t.Fatalf("等级放宽后应可继续创建书籍，实际 %d", status)
	}
	if status := e.upload(t, u, 2<<20); status != http.StatusOK {
		t.Fatalf("等级放宽后 2MB 上传应成功，实际 %d", status)
	}
	if status, _ := e.doAs(t, u, http.MethodPost, "/api/v1/collect/site/preview", `{"url":"http://127.0.0.1/"}`); status == http.StatusForbidden {
		t.Fatal("等级开放整站采集后不应再 403")
	}

	// 管理员不受限
	var admin models.User
	e.db.Where("username = ?", "growth-admin").First(&admin)
	for i := 0; i < 4; i++ {
		createBook(&admin, "admin-"+strconv.Itoa(i))
	}
	if status := createBook(&admin, "admin-more"); status != http.StatusOK {
		t.Fatalf("管理员不受书籍上限限制，实际 %d", status)
	}
}
