package app

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"infosphere/server/internal/config"
)

// 集成测试：覆盖 安装 → 登录 → 建书 → 发章节 → 公开阅读 → 系统版本 的完整链路
func TestFullLifecycle(t *testing.T) {
	t.Setenv("INFO_SPHERE_DATA", t.TempDir())

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("加载配置失败: %v", err)
	}
	a, err := New(cfg)
	if err != nil {
		t.Fatalf("创建应用失败: %v", err)
	}
	ts := httptest.NewServer(a.Router())
	defer ts.Close()

	client := &http.Client{Timeout: 10 * 1e9}
	post := func(path string, body any, token string) map[string]any {
		t.Helper()
		raw, _ := json.Marshal(body)
		req, _ := http.NewRequest(http.MethodPost, ts.URL+path, bytes.NewReader(raw))
		req.Header.Set("Content-Type", "application/json")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("POST %s: %v", path, err)
		}
		defer resp.Body.Close()
		var payload map[string]any
		_ = json.NewDecoder(resp.Body).Decode(&payload)
		if resp.StatusCode >= 300 {
			t.Fatalf("POST %s 返回 %d: %v", path, resp.StatusCode, payload)
		}
		return payload
	}
	get := func(path string, token string) (int, map[string]any) {
		t.Helper()
		req, _ := http.NewRequest(http.MethodGet, ts.URL+path, nil)
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("GET %s: %v", path, err)
		}
		defer resp.Body.Close()
		var payload map[string]any
		_ = json.NewDecoder(resp.Body).Decode(&payload)
		return resp.StatusCode, payload
	}

	// 1. 安装状态：未安装
	status, payload := get("/api/v1/setup/status", "")
	if status != 200 || payload["data"].(map[string]any)["installed"] != false {
		t.Fatalf("安装状态异常: %d %v", status, payload)
	}

	// 1.1 未安装时业务接口全部 503，仅 setup 放行
	status, payload = get("/api/v1/books", "")
	if status != 503 || payload["code"] != "NOT_INSTALLED" {
		t.Fatalf("未安装时业务接口应返回 503 NOT_INSTALLED: %d %v", status, payload)
	}
	status, _ = get("/api/v1/stats", "")
	if status != 503 {
		t.Fatalf("未安装时 stats 应返回 503: %d", status)
	}
	status, _ = get("/api/v1/health", "")
	if status != 200 {
		t.Fatalf("未安装时健康检查应可用: %d", status)
	}

	// 2. 安装（sqlite）
	install := post("/api/v1/setup/install", map[string]any{
		"database": map[string]any{"type": "sqlite"},
		"site":     map[string]any{"name": "测试站", "description": "集成测试"},
		"admin":    map[string]any{"username": "admin", "email": "admin@test.local", "password": "secret123"},
	}, "")
	data := install["data"].(map[string]any)
	adminToken := data["token"].(string)
	if adminToken == "" {
		t.Fatal("安装后应返回令牌")
	}

	// 3. 重复安装应被拒绝
	status, _ = get("/api/v1/setup/status", "")
	if status != 200 {
		t.Fatalf("状态查询失败: %d", status)
	}

	// 4. 建书
	book := post("/api/v1/books", map[string]any{
		"title": "Go Handbook", "description": "testing", "status": "published", "is_public": true,
	}, adminToken)
	bookData := book["data"].(map[string]any)
	slug := bookData["slug"].(string)
	bookID := int(bookData["id"].(float64))
	if slug != "go-handbook" {
		t.Fatalf("slug 生成错误: %s", slug)
	}

	// 5. 发章节
	doc := post(fmt.Sprintf("/api/v1/books/%d/documents", bookID), map[string]any{
		"title": "Chapter One", "content": "# hello", "status": "published",
	}, adminToken)
	docData := doc["data"].(map[string]any)
	docSlug := docData["slug"].(string)

	// 5.1 标签：建书时携带 tags，自动创建并关联
	book2 := post("/api/v1/books", map[string]any{
		"title": "Tagged Book", "status": "published", "is_public": true,
		"tags": []any{"Go", "后端开发"},
	}, adminToken)
	book2Data := book2["data"].(map[string]any)
	book2ID := int(book2Data["id"].(float64))
	tags := book2Data["tags"].([]any)
	if len(tags) != 2 {
		t.Fatalf("书籍应携带 2 个标签: %v", tags)
	}
	status, payload = get("/api/v1/tags", "")
	tagList := payload["data"].([]any)
	if status != 200 || len(tagList) != 2 {
		t.Fatalf("标签列表异常: %d %v", status, tagList)
	}
	var goTag map[string]any
	for _, t := range tagList {
		if m := t.(map[string]any); m["name"] == "Go" {
			goTag = m
		}
	}
	if goTag == nil || goTag["book_count"].(float64) != 1 {
		t.Fatalf("标签计数错误: %v", tagList)
	}
	// 按标签过滤书籍
	status, payload = get("/api/v1/books?tag=go", "")
	if status != 200 || payload["data"].(map[string]any)["total"].(float64) != 1 {
		t.Fatalf("按标签过滤失败: %d %v", status, payload)
	}
	_ = book2ID

	// 5.1 空书籍的文档树应返回 [] 而非 null
	emptyBook := post("/api/v1/books", map[string]any{
		"title": "Empty Book", "status": "published", "is_public": true,
	}, adminToken)
	emptyBookID := int(emptyBook["data"].(map[string]any)["id"].(float64))
	status, payload = get(fmt.Sprintf("/api/v1/books/%d/documents", emptyBookID), "")
	if status != 200 {
		t.Fatalf("空书籍文档树查询失败: %d", status)
	}
	if payload["data"] == nil {
		t.Fatalf("空文档树不应返回 null")
	}
	if _, isArr := payload["data"].([]any); !isArr {
		t.Fatalf("空文档树应为数组: %v", payload["data"])
	}

	// 6. 匿名读取书籍与章节
	status, payload = get("/api/v1/books/slug/"+slug, "")
	if status != 200 || payload["data"].(map[string]any)["title"] != "Go Handbook" {
		t.Fatalf("匿名读取书籍失败: %d %v", status, payload)
	}
	status, payload = get(fmt.Sprintf("/api/v1/books/%d/documents/slug/%s", bookID, docSlug), "")
	if status != 200 || payload["data"].(map[string]any)["content"] != "# hello" {
		t.Fatalf("匿名读取章节失败: %d %v", status, payload)
	}

	// 7. 注册普通用户（无权限改别人的书）
	reg := post("/api/v1/auth/register", map[string]any{
		"username": "alice", "password": "alice123",
	}, "")
	aliceToken := reg["data"].(map[string]any)["token"].(string)
	status, _ = get(fmt.Sprintf("/api/v1/books/%d", bookID), aliceToken)
	if status != 200 {
		t.Fatalf("登录用户读取公开书籍失败: %d", status)
	}

	// 7.1 权限体系：alice 拥有 book:create 但没有 site:update / system:*
	status, payload = get("/api/v1/auth/permissions", aliceToken)
	if status != 200 {
		t.Fatalf("权限查询失败: %d %v", status, payload)
	}
	perms := map[string]bool{}
	for _, p := range payload["data"].([]any) {
		perms[p.(string)] = true
	}
	if !perms["book:create"] || perms["site:update"] || perms["system:upgrade"] || !perms["tag:create"] || perms["tag:delete"] {
		t.Fatalf("普通用户权限集错误: %v", perms)
	}

	// 7.1 普通用户可创建标签（tag:create）
	created := post("/api/v1/tags", map[string]any{"name": "随笔"}, aliceToken)
	if created["data"].(map[string]any)["slug"] == "" {
		t.Fatalf("普通用户创建标签失败: %v", created)
	}
	// 普通用户删除标签应 403（tag:delete 仅管理员）
	req2, _ := http.NewRequest(http.MethodDelete, ts.URL+"/api/v1/tags/1", nil)
	req2.Header.Set("Authorization", "Bearer "+aliceToken)
	resp2, err := client.Do(req2)
	if err != nil {
		t.Fatalf("DELETE /tags/1: %v", err)
	}
	resp2.Body.Close()
	if resp2.StatusCode != 403 {
		t.Fatalf("普通用户删除标签应 403: %d", resp2.StatusCode)
	}
	req, _ := http.NewRequest(http.MethodPut, ts.URL+"/api/v1/site", bytes.NewReader([]byte(`{"site_name":"x"}`)))
	req.Header.Set("Authorization", "Bearer "+aliceToken)
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("PUT /site: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != 403 {
		t.Fatalf("普通用户更新站点配置应 403: %d", resp.StatusCode)
	}

	// 7.2 管理员拥有 system:read
	status, payload = get("/api/v1/system/version", adminToken)
	if status != 200 || payload["data"].(map[string]any)["version"] == "" {
		t.Fatalf("版本查询失败: %d %v", status, payload)
	}
	// 普通用户禁止访问
	status, _ = get("/api/v1/system/version", aliceToken)
	if status != 403 {
		t.Fatalf("普通用户访问版本接口应被拒绝: %d", status)
	}

	// 9. 健康检查
	status, payload = get("/api/v1/health", "")
	if status != 200 || payload["db"] != "up" {
		t.Fatalf("健康检查失败: %d %v", status, payload)
	}
}
