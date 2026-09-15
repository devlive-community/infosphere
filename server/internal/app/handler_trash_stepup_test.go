package app

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"infosphere/server/internal/config"

	"github.com/pquerna/otp/totp"
)

// TestTrashDeleteRequiresStepUp 覆盖：开启 2FA 且勾选 delete 后，永久删除回收站书籍必须先二次认证。
func TestTrashDeleteRequiresStepUp(t *testing.T) {
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
	data := func(m map[string]any) map[string]any { return m["data"].(map[string]any) }

	_, installed := req(http.MethodPost, "/api/v1/setup/install", map[string]any{
		"database": map[string]any{"type": "sqlite"},
		"site":     map[string]any{"name": "2FA 回收站测试"},
		"admin":    map[string]any{"username": "admin", "email": "a@test.local", "password": "secret123"},
	}, "")
	token := data(installed)["token"].(string)

	// 建书 → 软删除进回收站
	_, bookResp := req(http.MethodPost, "/api/v1/books", map[string]any{"title": "待删"}, token)
	bookID := int(data(bookResp)["id"].(float64))
	req(http.MethodDelete, fmt.Sprintf("/api/v1/books/%d", bookID), nil, token)

	// 开启 2FA：setup 拿密钥 → enable（默认勾选含 delete）
	_, setup := req(http.MethodPost, "/api/v1/auth/2fa/setup", nil, token)
	secret := data(setup)["secret"].(string)
	code, _ := totp.GenerateCode(secret, time.Now())
	if s, _ := req(http.MethodPost, "/api/v1/auth/2fa/enable", map[string]any{"code": code}, token); s != http.StatusOK {
		t.Fatalf("开启 2FA 应成功: %d", s)
	}

	// 未二次认证 → 永久删除被拒（403 TWO_FACTOR_REQUIRED）
	s, blocked := req(http.MethodDelete, fmt.Sprintf("/api/v1/trash/books/%d", bookID), nil, token)
	if s != http.StatusForbidden || blocked["code"] != "TWO_FACTOR_REQUIRED" {
		t.Fatalf("未二次认证时永久删除应 403 TWO_FACTOR_REQUIRED，实际 %d %v", s, blocked)
	}

	// 二次认证后 → 永久删除成功
	code2, _ := totp.GenerateCode(secret, time.Now())
	if s, _ := req(http.MethodPost, "/api/v1/auth/2fa/verify", map[string]any{"code": code2}, token); s != http.StatusOK {
		t.Fatalf("二次认证应成功")
	}
	if s, _ := req(http.MethodDelete, fmt.Sprintf("/api/v1/trash/books/%d", bookID), nil, token); s != http.StatusOK {
		t.Fatalf("二次认证后永久删除应成功: %d", s)
	}
}
