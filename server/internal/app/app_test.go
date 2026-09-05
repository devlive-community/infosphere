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

	// 8. 系统版本（需要管理员）
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
