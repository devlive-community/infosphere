package app

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"knowforge/server/internal/auth"
	"knowforge/server/internal/config"
	"knowforge/server/internal/models"
	"knowforge/server/internal/plugincore"

	"github.com/gin-gonic/gin"
)

// 关注书籍：关注/取关幂等、我的关注列表、章节发布通知关注者；插件禁用后接口 404。
func TestBookFollowAndUpdateNotification(t *testing.T) {
	app, author, db := newContentImportTestApp(t)
	app.Notifications = newNotificationHub()
	app.Config = &config.Config{Secret: "test-secret-book-follow"} // 令牌签发/校验用同一密钥
	author.Role = "user"
	db.Save(author)

	book := models.Book{Title: "Follow Book", Slug: "follow-book", UserID: author.ID, Status: "published", IsPublic: true}
	if err := db.Create(&book).Error; err != nil {
		t.Fatal(err)
	}
	doc := models.Document{BookID: book.ID, UserID: author.ID, Title: "第一章", Slug: "ch1", Status: "draft", Content: "x"}
	if err := db.Create(&doc).Error; err != nil {
		t.Fatal(err)
	}
	follower := &models.User{Username: "follower", Email: "follower@test.local", IsActive: true, Role: "user"}
	if err := db.Create(follower).Error; err != nil {
		t.Fatal(err)
	}

	// 真实令牌 + 迁移后的插件路由（由 bookfollow 子包 RegisterRoutes 注册），端到端验证行为不变。
	authorToken, _ := auth.GenerateToken(app.Config.Secret, author.ID, author.Username, author.Role)
	followerToken, _ := auth.GenerateToken(app.Config.Secret, follower.ID, follower.Username, follower.Role)

	r := gin.New()
	grp := r.Group("")
	for _, p := range plugincore.Behaviors() {
		if p.Key() == pluginBookFollow {
			p.RegisterRoutes(grp, app)
		}
	}
	r.PUT("/documents/:id", app.RequireAuth(), app.UpdateDocument)
	r.POST("/books/:id/documents", app.RequireAuth(), app.CreateDocument)

	call := func(method, path, body, token string) (int, map[string]any) {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		if body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		r.ServeHTTP(rec, req)
		p := map[string]any{}
		_ = json.Unmarshal(rec.Body.Bytes(), &p)
		return rec.Code, p
	}

	if st, p := call(http.MethodPost, fmt.Sprintf("/books/%d/follow", book.ID), "", followerToken); st != http.StatusOK || p["data"].(map[string]any)["following"] != true {
		t.Fatalf("关注失败: %d %v", st, p)
	}
	if st, p := call(http.MethodGet, "/users/me/follows", "", followerToken); st != http.StatusOK || int(p["data"].(map[string]any)["total"].(float64)) != 1 {
		t.Fatalf("我的关注列表异常: %d %v", st, p)
	}

	// 作者发布章节 → 关注者收到 book_update 通知（验证章节发布钩子）
	if st, _ := call(http.MethodPut, fmt.Sprintf("/documents/%d", doc.ID), `{"status":"published"}`, authorToken); st != http.StatusOK {
		t.Fatalf("发布章节失败: %d", st)
	}
	var notifCount int64
	db.Model(&models.Notification{}).Where("user_id = ? AND type = ?", follower.ID, "book_update").Count(&notifCount)
	if notifCount != 1 {
		t.Fatalf("关注者应收到 1 条更新通知，实际 %d", notifCount)
	}
	// 创建时直接发布同样是首次发布，也要通知
	if st, p := call(http.MethodPost, fmt.Sprintf("/books/%d/documents", book.ID), `{"title":"第二章","content":"正文","status":"published"}`, authorToken); st != http.StatusOK {
		t.Fatalf("创建并发布章节失败: %d %v", st, p)
	}
	db.Model(&models.Notification{}).Where("user_id = ? AND type = ?", follower.ID, "book_update").Count(&notifCount)
	if notifCount != 2 {
		t.Fatalf("创建即发布的章节也应通知关注者，实际 %d 条", notifCount)
	}

	if st, p := call(http.MethodDelete, fmt.Sprintf("/books/%d/follow", book.ID), "", followerToken); st != http.StatusOK || p["data"].(map[string]any)["following"] != false {
		t.Fatalf("取关失败: %d %v", st, p)
	}

	// 禁用插件后接口 404
	_ = app.setFeaturePluginEnabled(pluginInfoByKey(pluginBookFollow), false)
	app.syncPluginPermissions()
	if st, _ := call(http.MethodGet, "/users/me/follows", "", followerToken); st != http.StatusNotFound {
		t.Fatalf("禁用后我的关注应 404，实际 %d", st)
	}
	// 恢复（避免影响同包其它用例的全局 authz 状态）
	_ = app.setFeaturePluginEnabled(pluginInfoByKey(pluginBookFollow), true)
	app.syncPluginPermissions()
}
