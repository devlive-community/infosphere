package app

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"infosphere/server/internal/config"
	"infosphere/server/internal/models"
)

// 卸载插件必须真正删除，且不被进行中的安装 goroutine 重新写回（代次守卫）。
func TestPluginUninstallGuardsAgainstStaleInstall(t *testing.T) {
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

	count := func() int64 {
		var n int64
		a.DB.Model(&models.Plugin{}).Where("key = ?", pluginPDFExport).Count(&n)
		return n
	}
	uninstall := func() int {
		ur, _ := http.NewRequest(http.MethodPost, ts.URL+"/api/v1/admin/plugins/"+pluginPDFExport+"/uninstall", nil)
		ur.Header.Set("Authorization", "Bearer "+token)
		ur2, err := http.DefaultClient.Do(ur)
		if err != nil {
			t.Fatalf("卸载请求失败: %v", err)
		}
		defer ur2.Body.Close()
		return ur2.StatusCode
	}

	// 模拟一次“进行中”的安装：拿到代次并落下 downloading 行
	gen := a.plugins.begin(pluginPDFExport)
	p := models.Plugin{Key: pluginPDFExport}
	a.savePluginMeta(&p, map[string]any{"status": "downloading"})
	if count() != 1 {
		t.Fatalf("安装前置：应存在 1 行，实际 %d", count())
	}

	// 卸载
	if st := uninstall(); st != http.StatusOK {
		t.Fatalf("卸载应 200，实际 %d", st)
	}
	if count() != 0 {
		t.Fatalf("卸载后应无插件行，实际 %d", count())
	}

	// 旧安装 goroutine 事后完成并尝试写回：必须被代次守卫丢弃
	if a.plugins.current(pluginPDFExport, gen) {
		t.Fatalf("卸载后旧代次仍被判为当前")
	}
	p.Installed = true
	if a.plugins.current(pluginPDFExport, gen) {
		a.savePluginMeta(&p, map[string]any{"status": "installed"})
	}
	if count() != 0 {
		t.Fatalf("BUG：卸载后被进行中的安装重新写回（rows=%d）", count())
	}

	// 权限：普通用户与匿名不可卸载
	if st := func() int {
		ur, _ := http.NewRequest(http.MethodPost, ts.URL+"/api/v1/admin/plugins/"+pluginPDFExport+"/uninstall", nil)
		ur2, err := http.DefaultClient.Do(ur)
		if err != nil {
			t.Fatalf("匿名卸载请求失败: %v", err)
		}
		defer ur2.Body.Close()
		return ur2.StatusCode
	}(); st != http.StatusUnauthorized {
		t.Fatalf("匿名卸载应 401，实际 %d", st)
	}
}
