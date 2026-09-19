package app

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"infosphere/server/internal/authz"
	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

// 关注书籍：关注/取关幂等、我的关注列表、章节发布通知关注者；插件禁用后接口 404。
func TestBookFollowAndUpdateNotification(t *testing.T) {
	app, author, db := newContentImportTestApp(t)
	app.Notifications = newNotificationHub()
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

	mkRouter := func(u *models.User) *gin.Engine {
		r := gin.New()
		r.Use(func(c *gin.Context) { c.Set("user", u); c.Next() })
		r.POST("/books/:id/follow", app.RequireFeaturePlugin(pluginBookFollow), app.RequirePermission(authz.FollowCreate), app.FollowBook)
		r.DELETE("/books/:id/follow", app.RequireFeaturePlugin(pluginBookFollow), app.RequirePermission(authz.FollowDelete), app.UnfollowBook)
		r.GET("/users/me/follows", app.RequireFeaturePlugin(pluginBookFollow), app.RequirePermission(authz.FollowRead), app.MyFollows)
		r.PUT("/documents/:id", app.UpdateDocument)
		return r
	}
	followerRouter := mkRouter(follower)
	call := func(router *gin.Engine, method, path, body string) (int, map[string]any) {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		if body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		router.ServeHTTP(rec, req)
		p := map[string]any{}
		_ = json.Unmarshal(rec.Body.Bytes(), &p)
		return rec.Code, p
	}

	if st, p := call(followerRouter, http.MethodPost, fmt.Sprintf("/books/%d/follow", book.ID), ""); st != http.StatusOK || p["data"].(map[string]any)["following"] != true {
		t.Fatalf("关注失败: %d %v", st, p)
	}
	if st, p := call(followerRouter, http.MethodGet, "/users/me/follows", ""); st != http.StatusOK || int(p["data"].(map[string]any)["total"].(float64)) != 1 {
		t.Fatalf("我的关注列表异常: %d %v", st, p)
	}

	// 作者发布章节 → 关注者收到 book_update 通知
	if st, _ := call(mkRouter(author), http.MethodPut, fmt.Sprintf("/documents/%d", doc.ID), `{"status":"published"}`); st != http.StatusOK {
		t.Fatalf("发布章节失败: %d", st)
	}
	var notifCount int64
	db.Model(&models.Notification{}).Where("user_id = ? AND type = ?", follower.ID, "book_update").Count(&notifCount)
	if notifCount != 1 {
		t.Fatalf("关注者应收到 1 条更新通知，实际 %d", notifCount)
	}

	if st, p := call(followerRouter, http.MethodDelete, fmt.Sprintf("/books/%d/follow", book.ID), ""); st != http.StatusOK || p["data"].(map[string]any)["following"] != false {
		t.Fatalf("取关失败: %d %v", st, p)
	}

	// 禁用插件后接口 404
	_ = app.setFeaturePluginEnabled(pluginInfoByKey(pluginBookFollow), false)
	app.syncPluginPermissions()
	if st, _ := call(followerRouter, http.MethodGet, "/users/me/follows", ""); st != http.StatusNotFound {
		t.Fatalf("禁用后我的关注应 404，实际 %d", st)
	}
	// 恢复（避免影响同包其它用例的全局 authz 状态）
	_ = app.setFeaturePluginEnabled(pluginInfoByKey(pluginBookFollow), true)
	app.syncPluginPermissions()
}
