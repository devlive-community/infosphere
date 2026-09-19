package app

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"infosphere/server/internal/config"
)

// 后台标签管理：创建（带图标）→ 列表可见 → 更新名称与图标；标签插件禁用后接口 404。
func TestAdminTagManagementAndPluginGate(t *testing.T) {
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

	install := `{"database":{"type":"sqlite"},"site":{"name":"t"},"admin":{"username":"admin","email":"a@b.c","password":"secret123"}}`
	r, _ := http.NewRequest(http.MethodPost, ts.URL+"/api/v1/setup/install", bytes.NewBufferString(install))
	r.Header.Set("Content-Type", "application/json")
	resp, _ := http.DefaultClient.Do(r)
	var ip map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&ip)
	resp.Body.Close()
	token := ip["data"].(map[string]any)["token"].(string)

	do := func(method, path, body string) (int, map[string]any) {
		var rdr *bytes.Buffer = bytes.NewBufferString(body)
		req, _ := http.NewRequest(method, ts.URL+path, rdr)
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("请求失败: %v", err)
		}
		defer res.Body.Close()
		payload := map[string]any{}
		_ = json.NewDecoder(res.Body).Decode(&payload)
		return res.StatusCode, payload
	}

	// 创建带图标的标签
	st, payload := do(http.MethodPost, "/api/v1/admin/tags", `{"name":"Go","icon_type":"fa","icon_value":"fa-code"}`)
	if st != http.StatusOK {
		t.Fatalf("创建标签应 200，实际 %d %v", st, payload)
	}
	data := payload["data"].(map[string]any)
	id := int(data["id"].(float64))
	if data["icon_value"] != "fa-code" {
		t.Fatalf("图标未保存：%v", data)
	}

	// 列表可见
	st, payload = do(http.MethodGet, "/api/v1/admin/tags", "")
	if st != http.StatusOK || int(payload["data"].(map[string]any)["total"].(float64)) != 1 {
		t.Fatalf("标签列表异常：%d %v", st, payload)
	}

	// 更新名称与图标
	st, payload = do(http.MethodPut, "/api/v1/admin/tags/"+strconv.Itoa(id), `{"name":"Golang","icon_type":"image","icon_value":"/uploads/x.png"}`)
	if st != http.StatusOK || payload["data"].(map[string]any)["name"] != "Golang" {
		t.Fatalf("更新标签失败：%d %v", st, payload)
	}

	// 禁用标签插件后接口 404（默认启用，用插件卸载端点切换禁用）
	if st, _ := do(http.MethodPost, "/api/v1/admin/plugins/"+pluginTags+"/uninstall", ""); st != http.StatusOK {
		t.Fatalf("禁用标签插件应 200，实际 %d", st)
	}
	if st, _ := do(http.MethodGet, "/api/v1/admin/tags", ""); st != http.StatusNotFound {
		t.Fatalf("禁用后标签管理应 404，实际 %d", st)
	}
	if st, _ := do(http.MethodGet, "/api/v1/tags", ""); st != http.StatusNotFound {
		t.Fatalf("禁用后公开标签列表应 404，实际 %d", st)
	}
}
