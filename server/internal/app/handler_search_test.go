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

// 搜索接口集成测试：匿名可搜公开内容、空结果必须是数组（防 nil 切片序列化 null）、章节结果带 doc_slug/book_slug
func TestGlobalSearch(t *testing.T) {
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
	request := func(method, path string, body any, token string) (int, map[string]any) {
		t.Helper()
		var raw []byte
		if body != nil {
			raw, _ = json.Marshal(body)
		}
		req, _ := http.NewRequest(method, ts.URL+path, bytes.NewReader(raw))
		req.Header.Set("Content-Type", "application/json")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("%s %s: %v", method, path, err)
		}
		defer resp.Body.Close()
		var payload map[string]any
		_ = json.NewDecoder(resp.Body).Decode(&payload)
		return resp.StatusCode, payload
	}

	// 安装（sqlite）并取得管理员令牌
	_, install := request(http.MethodPost, "/api/v1/setup/install", map[string]any{
		"database": map[string]any{"type": "sqlite"},
		"site":     map[string]any{"name": "搜索测试站"},
		"admin":    map[string]any{"username": "admin", "email": "admin@test.local", "password": "secret123"},
	}, "")
	adminToken := install["data"].(map[string]any)["token"].(string)

	// 公开书籍 + 命中内容的章节
	status, book := request(http.MethodPost, "/api/v1/books", map[string]any{
		"title": "Quantumflux Handbook", "description": "search fixture", "status": "published", "is_public": true,
	}, adminToken)
	if status != 200 {
		t.Fatalf("建书失败: %d %v", status, book)
	}
	bookID := int(book["data"].(map[string]any)["id"].(float64))
	request(http.MethodPost, fmt.Sprintf("/api/v1/books/%d/documents", bookID), map[string]any{
		"title": "Alpha Chapter", "content": "zebraunicorn 独有关键词正文", "status": "published",
	}, adminToken)

	search := func(q string) map[string]any {
		t.Helper()
		path := "/api/v1/search"
		if q != "" {
			path += "?q=" + q
		}
		s, payload := request(http.MethodGet, path, nil, "")
		if s != 200 {
			t.Fatalf("搜索 %q 返回 %d: %v", q, s, payload)
		}
		return payload["data"].(map[string]any)
	}

	// 无关键词：空结果必须是数组而非 null
	empty := search("")
	if _, ok := empty["books"].([]any); !ok {
		t.Errorf("books 应为 [] 而非 %v", empty["books"])
	}
	if _, ok := empty["documents"].([]any); !ok {
		t.Errorf("documents 应为 [] 而非 %v", empty["documents"])
	}

	// 命中书籍标题：书籍结果非空，章节为空数组
	byTitle := search("Quantumflux")
	books, ok := byTitle["books"].([]any)
	if !ok || len(books) != 1 {
		t.Fatalf("标题搜索应命中 1 本书: %v", byTitle["books"])
	}
	if docs, ok := byTitle["documents"].([]any); !ok || len(docs) != 0 {
		t.Errorf("无章节命中时 documents 应为 []: %v", byTitle["documents"])
	}

	// 命中章节正文：结果带 doc_slug 与 book_slug，书籍为空数组
	byContent := search("zebraunicorn")
	docs, ok := byContent["documents"].([]any)
	if !ok || len(docs) != 1 {
		t.Fatalf("正文搜索应命中 1 章: %v", byContent["documents"])
	}
	doc := docs[0].(map[string]any)
	if doc["doc_slug"] == "" || doc["book_slug"] == "" {
		t.Errorf("章节结果应携带 doc_slug/book_slug: %v", doc)
	}
	if bs, ok := byContent["books"].([]any); !ok || len(bs) != 0 {
		t.Errorf("无书籍命中时 books 应为 []: %v", byContent["books"])
	}
}
