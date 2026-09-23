package pdfexport_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"knowforge/server/internal/app"
	"knowforge/server/internal/config"
	"knowforge/server/internal/models"
)

// PDF 导出端点由插件注册：权限规则与核心导出一致；未安装 Chromium 运行时给出明确提示。
func TestExportBookPDFRoutingAndGuards(t *testing.T) {
	t.Setenv("KNOWFORGE_DATA", t.TempDir())
	cfg, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	a, err := app.New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(a.Router())
	defer server.Close()
	client := &http.Client{Timeout: 10 * time.Second}
	do := func(method, path, body, token string) (int, map[string]any) {
		req, _ := http.NewRequest(method, server.URL+path, bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		payload := map[string]any{}
		_ = json.NewDecoder(resp.Body).Decode(&payload)
		return resp.StatusCode, payload
	}
	_, installed := do(http.MethodPost, "/api/v1/setup/install", `{"database":{"type":"sqlite"},"site":{"name":"PDF 测试"},"admin":{"username":"pdf-owner","email":"pdf-owner@test.local","password":"secret123"}}`, "")
	token := installed["data"].(map[string]any)["token"].(string)
	var owner models.User
	a.DB.Where("username = ?", "pdf-owner").First(&owner)

	private := models.Book{Title: "私有书", Slug: "pdf-private", UserID: owner.ID, Status: "draft"}
	a.DB.Create(&private)
	path := "/api/v1/books/" + strconv.FormatUint(uint64(private.ID), 10) + "/export/pdf"
	if status, _ := do(http.MethodGet, path, "", ""); status != http.StatusForbidden && status != http.StatusNotFound {
		t.Fatalf("游客不应能导出私有书籍，实际 %d", status)
	}
	status, payload := do(http.MethodGet, path, "", token)
	if status != http.StatusBadRequest || !strings.Contains(payload["message"].(string), "PDF 导出插件尚未安装") {
		t.Fatalf("作者导出但未安装运行时应得到明确提示: %d %v", status, payload)
	}
}
