package app

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

// 回收站永久删除：开启 2FA 且勾选「delete」操作、无有效 step-up 时必须要求二次认证。
func TestPermanentDeleteRequiresStepUp(t *testing.T) {
	app, user, db := newContentImportTestApp(t)
	db.Model(user).Updates(map[string]any{"two_factor_enabled": true, "two_factor_ops": "delete"})
	user.TwoFactorEnabled = true
	user.TwoFactorOps = "delete"

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodDelete, "/trash/books/1", nil)
	c.Set("user", user)

	if app.requireStepUp(c, tfOpDelete) {
		t.Fatal("开启 2FA-delete 且无有效 step-up 时，永久删除应要求二次认证")
	}
	if w.Code != http.StatusForbidden {
		t.Fatalf("应返回 403，实际 %d", w.Code)
	}

	// 未勾选 delete 操作 → 不要求
	user.TwoFactorOps = "login"
	w2 := httptest.NewRecorder()
	c2, _ := gin.CreateTestContext(w2)
	c2.Request = httptest.NewRequest(http.MethodDelete, "/trash/books/1", nil)
	c2.Set("user", user)
	if !app.requireStepUp(c2, tfOpDelete) {
		t.Fatal("未勾选 delete 操作时不应要求二次认证")
	}
}
