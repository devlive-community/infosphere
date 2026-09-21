package app

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"knowforge/server/internal/config"
)

// TestBookTranslationsGrouping 覆盖翻译组：同 trans_group 的可见书籍聚合、私有书对匿名不可见、少于两本不成组。
func TestBookTranslationsGrouping(t *testing.T) {
	t.Setenv("INFO_SPHERE_DATA", t.TempDir())
	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("加载配置失败: %v", err)
	}
	a, err := New(cfg)
	if err != nil {
		t.Fatalf("创建应用失败: %v", err)
	}
	server := httptest.NewServer(a.Router())
	defer server.Close()
	client := &http.Client{Timeout: 10 * time.Second}

	request := func(method, path string, body any, token string) (int, map[string]any) {
		t.Helper()
		var raw []byte
		if body != nil {
			raw, _ = json.Marshal(body)
		}
		req, _ := http.NewRequest(method, server.URL+path, bytes.NewReader(raw))
		req.Header.Set("Content-Type", "application/json")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("%s %s: %v", method, path, err)
		}
		defer resp.Body.Close()
		payload := map[string]any{}
		_ = json.NewDecoder(resp.Body).Decode(&payload)
		return resp.StatusCode, payload
	}

	_, installed := request(http.MethodPost, "/api/v1/setup/install", map[string]any{
		"database": map[string]any{"type": "sqlite"},
		"site":     map[string]any{"name": "多语言测试"},
		"admin":    map[string]any{"username": "author", "email": "author@test.local", "password": "secret123"},
	}, "")
	token := installed["data"].(map[string]any)["token"].(string)

	mk := func(title, lang, group string, public bool) int {
		_, created := request(http.MethodPost, "/api/v1/books", map[string]any{
			"title": title, "status": "published", "is_public": public, "language": lang, "trans_group": group,
		}, token)
		return int(created["data"].(map[string]any)["id"].(float64))
	}
	zh := mk("中文书", "中文", "grp1", true)
	mk("English Book", "English", "grp1", true)
	mk("私有译本", "日本語", "grp1", false)
	solo := mk("孤立书", "中文", "grp2", true)

	// 匿名读取中文书的翻译组：公开的两本，私有排除
	status, resp := request(http.MethodGet, fmt.Sprintf("/api/v1/books/%d/translations", zh), nil, "")
	if status != http.StatusOK {
		t.Fatalf("读取翻译组失败: %d", status)
	}
	items := resp["data"].(map[string]any)["items"].([]any)
	if len(items) != 2 {
		t.Fatalf("匿名应见 2 本公开译本，实际 %d", len(items))
	}
	// 作者本人可见全部 3 本
	status, respAuthor := request(http.MethodGet, fmt.Sprintf("/api/v1/books/%d/translations", zh), nil, token)
	if status != http.StatusOK || len(respAuthor["data"].(map[string]any)["items"].([]any)) != 3 {
		t.Fatalf("作者应见 3 本（含私有）")
	}
	// 孤立书不成组
	_, respSolo := request(http.MethodGet, fmt.Sprintf("/api/v1/books/%d/translations", solo), nil, token)
	if len(respSolo["data"].(map[string]any)["items"].([]any)) != 0 {
		t.Fatalf("单本不应构成翻译组")
	}
}
