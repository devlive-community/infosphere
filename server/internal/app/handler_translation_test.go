package app

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"infosphere/server/internal/config"
)

func TestTranslationConfig(t *testing.T) {
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
	req := func(method, path string, body any, token string) (int, map[string]any) {
		t.Helper()
		var raw []byte
		if body != nil {
			raw, _ = json.Marshal(body)
		}
		r, _ := http.NewRequest(method, server.URL+path, bytes.NewReader(raw))
		r.Header.Set("Content-Type", "application/json")
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		resp, err := client.Do(r)
		if err != nil {
			t.Fatalf("%s %s: %v", method, path, err)
		}
		defer resp.Body.Close()
		p := map[string]any{}
		_ = json.NewDecoder(resp.Body).Decode(&p)
		return resp.StatusCode, p
	}

	_, installed := req(http.MethodPost, "/api/v1/setup/install", map[string]any{
		"database": map[string]any{"type": "sqlite"},
		"site":     map[string]any{"name": "翻译测试"},
		"admin":    map[string]any{"username": "admin", "email": "admin@test.local", "password": "secret123"},
	}, "")
	token := installed["data"].(map[string]any)["token"].(string)

	// 未配置时 /translate 应 403，/site 的 translation_enabled 为 false
	if status, _ := req(http.MethodPost, "/api/v1/translate", map[string]any{"text": "hi", "target_label": "简体中文"}, token); status != http.StatusForbidden {
		t.Fatalf("未配置翻译应 403，实际 %d", status)
	}
	_, site := req(http.MethodGet, "/api/v1/site", nil, "")
	if site["data"].(map[string]any)["translation_enabled"] != false {
		t.Fatalf("未配置时 translation_enabled 应为 false")
	}

	// 非法 provider 应 400
	if status, _ := req(http.MethodPut, "/api/v1/translation", map[string]any{"provider": "bogus"}, token); status != http.StatusBadRequest {
		t.Fatalf("非法翻译方式应 400，实际 %d", status)
	}

	// 配置 openai + key 后，translation_enabled 应为 true，管理端可回读配置
	if status, _ := req(http.MethodPut, "/api/v1/translation", map[string]any{"provider": "openai", "api_key": "sk-test", "model": "gpt-4o-mini"}, token); status != http.StatusOK {
		t.Fatalf("保存翻译配置应成功，实际 %d", status)
	}
	_, got := req(http.MethodGet, "/api/v1/translation", nil, token)
	if got["data"].(map[string]any)["provider"] != "openai" || got["data"].(map[string]any)["api_key"] != "sk-test" {
		t.Fatalf("翻译配置回读不一致: %v", got["data"])
	}
	_, site2 := req(http.MethodGet, "/api/v1/site", nil, "")
	if site2["data"].(map[string]any)["translation_enabled"] != true {
		t.Fatalf("配置后 translation_enabled 应为 true")
	}
	// 公开配置不应泄露 API Key
	if _, leaked := site2["data"].(map[string]any)["translation_api_key"]; leaked {
		t.Fatalf("公开 /site 不应包含 translation_api_key")
	}
}
