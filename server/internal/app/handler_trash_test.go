package app

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func trashTestRouter(app *App, user *models.User) *gin.Engine {
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("user", user)
		c.Next()
	})
	router.GET("/trash", app.ListTrash)
	router.DELETE("/books/:id", app.DeleteBook)
	router.DELETE("/documents/:id", app.DeleteDocument)
	router.POST("/trash/books/:id/restore", app.RestoreTrashedBook)
	router.DELETE("/trash/books/:id", app.PermanentlyDeleteBook)
	router.POST("/trash/documents/:id/restore", app.RestoreTrashedDocument)
	router.DELETE("/trash/documents/:id", app.PermanentlyDeleteDocument)
	return router
}

func trashRequest(t *testing.T, router http.Handler, method, path string) (int, map[string]any) {
	t.Helper()
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(method, path, nil))
	var payload map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("解析响应失败: %v body=%s", err, recorder.Body.String())
	}
	return recorder.Code, payload
}

func TestTrashDocumentTreeRestoreAndPermanentDelete(t *testing.T) {
	app, owner, db := newContentImportTestApp(t)
	book := models.Book{Title: "回收站测试", Slug: "trash-doc-book", UserID: owner.ID, Status: "draft"}
	if err := db.Create(&book).Error; err != nil {
		t.Fatal(err)
	}
	parent := models.Document{BookID: book.ID, UserID: owner.ID, Title: "父章节", Slug: "parent", Status: "draft"}
	if err := db.Create(&parent).Error; err != nil {
		t.Fatal(err)
	}
	child := models.Document{BookID: book.ID, UserID: owner.ID, ParentID: &parent.ID, Title: "子章节", Slug: "child", Status: "draft"}
	if err := db.Create(&child).Error; err != nil {
		t.Fatal(err)
	}
	revision := newDocumentRevision(&child, owner.ID, "save")
	if err := db.Create(&revision).Error; err != nil {
		t.Fatal(err)
	}

	router := trashTestRouter(app, owner)
	status, payload := trashRequest(t, router, http.MethodDelete, fmt.Sprintf("/documents/%d", parent.ID))
	if status != http.StatusOK || payload["data"].(map[string]any)["count"].(float64) != 2 {
		t.Fatalf("删除章节子树失败: %d %v", status, payload)
	}
	var activeCount, deletedCount, revisionCount int64
	db.Model(&models.Document{}).Where("book_id = ?", book.ID).Count(&activeCount)
	db.Unscoped().Model(&models.Document{}).Where("book_id = ? AND deleted_at IS NOT NULL", book.ID).Count(&deletedCount)
	db.Model(&models.DocumentRevision{}).Where("document_id = ?", child.ID).Count(&revisionCount)
	if activeCount != 0 || deletedCount != 2 || revisionCount != 1 {
		t.Fatalf("软删除不应丢失章节或版本: active=%d deleted=%d revisions=%d", activeCount, deletedCount, revisionCount)
	}

	status, payload = trashRequest(t, router, http.MethodGet, "/trash?type=document")
	items := payload["data"].(map[string]any)["items"].([]any)
	if status != http.StatusOK || len(items) != 1 || items[0].(map[string]any)["descendant_count"].(float64) != 1 {
		t.Fatalf("回收站应只列删除批次根章节: %d %v", status, payload)
	}
	status, payload = trashRequest(t, router, http.MethodPost, fmt.Sprintf("/trash/documents/%d/restore", parent.ID))
	if status != http.StatusOK {
		t.Fatalf("恢复章节失败: %d %v", status, payload)
	}
	var restoredChild models.Document
	if err := db.First(&restoredChild, child.ID).Error; err != nil || restoredChild.ParentID == nil || *restoredChild.ParentID != parent.ID {
		t.Fatalf("恢复后应保持父子关系: %+v err=%v", restoredChild, err)
	}

	editor := models.User{Username: "trash-editor", Email: "trash-editor@test.local", IsActive: true}
	if err := db.Create(&editor).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&models.BookCollaborator{BookID: book.ID, UserID: editor.ID, Role: "editor"}).Error; err != nil {
		t.Fatal(err)
	}
	trashRequest(t, router, http.MethodDelete, fmt.Sprintf("/documents/%d", parent.ID))
	editorRouter := trashTestRouter(app, &editor)
	status, payload = trashRequest(t, editorRouter, http.MethodPost, fmt.Sprintf("/trash/documents/%d/restore", parent.ID))
	if status != http.StatusOK {
		t.Fatalf("editor 应可恢复章节: %d %v", status, payload)
	}
	trashRequest(t, router, http.MethodDelete, fmt.Sprintf("/documents/%d", parent.ID))
	status, _ = trashRequest(t, editorRouter, http.MethodDelete, fmt.Sprintf("/trash/documents/%d", parent.ID))
	if status != http.StatusNotFound {
		t.Fatalf("editor 不得永久删除章节，实际 %d", status)
	}
	status, payload = trashRequest(t, router, http.MethodDelete, fmt.Sprintf("/trash/documents/%d", parent.ID))
	if status != http.StatusOK {
		t.Fatalf("永久删除章节失败: %d %v", status, payload)
	}
	db.Unscoped().Model(&models.Document{}).Where("id IN ?", []uint{parent.ID, child.ID}).Count(&deletedCount)
	db.Model(&models.DocumentRevision{}).Where("document_id = ?", child.ID).Count(&revisionCount)
	if deletedCount != 0 || revisionCount != 0 {
		t.Fatalf("永久删除应清理章节和版本: documents=%d revisions=%d", deletedCount, revisionCount)
	}
}

func TestTrashBookRestoreIsolationAndExpiration(t *testing.T) {
	app, owner, db := newContentImportTestApp(t)
	other := models.User{Username: "trash-other", Email: "trash-other@test.local", IsActive: true}
	if err := db.Create(&other).Error; err != nil {
		t.Fatal(err)
	}
	book := models.Book{Title: "整书恢复", Slug: "trash-book", UserID: owner.ID, Status: "published", IsPublic: true}
	if err := db.Create(&book).Error; err != nil {
		t.Fatal(err)
	}
	doc := models.Document{BookID: book.ID, UserID: owner.ID, Title: "章节", Slug: "chapter", Status: "published"}
	if err := db.Create(&doc).Error; err != nil {
		t.Fatal(err)
	}

	ownerRouter := trashTestRouter(app, owner)
	status, payload := trashRequest(t, ownerRouter, http.MethodDelete, fmt.Sprintf("/books/%d", book.ID))
	if status != http.StatusOK {
		t.Fatalf("书籍移入回收站失败: %d %v", status, payload)
	}
	var count int64
	db.Model(&models.Book{}).Where("id = ?", book.ID).Count(&count)
	if count != 0 {
		t.Fatal("软删除书籍不应继续出现在普通查询")
	}
	otherRouter := trashTestRouter(app, &other)
	status, _ = trashRequest(t, otherRouter, http.MethodPost, fmt.Sprintf("/trash/books/%d/restore", book.ID))
	if status != http.StatusNotFound {
		t.Fatalf("其他用户恢复书籍应返回 404，实际 %d", status)
	}
	status, _ = trashRequest(t, otherRouter, http.MethodPost, fmt.Sprintf("/trash/documents/%d/restore", doc.ID))
	if status != http.StatusNotFound {
		t.Fatalf("其他用户不得通过章节端点探测回收站书籍，实际 %d", status)
	}
	status, payload = trashRequest(t, ownerRouter, http.MethodPost, fmt.Sprintf("/trash/books/%d/restore", book.ID))
	if status != http.StatusOK {
		t.Fatalf("恢复书籍失败: %d %v", status, payload)
	}
	if err := db.First(&book, book.ID).Error; err != nil {
		t.Fatalf("书籍应恢复可见: %v", err)
	}
	if err := db.First(&doc, doc.ID).Error; err != nil {
		t.Fatalf("书籍同批次章节应恢复: %v", err)
	}

	trashRequest(t, ownerRouter, http.MethodDelete, fmt.Sprintf("/books/%d", book.ID))
	expiredAt := currentTime().Add(-trashRetention - time.Hour)
	if err := db.Unscoped().Model(&models.Book{}).Where("id = ?", book.ID).Update("deleted_at", expiredAt).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Unscoped().Model(&models.Document{}).Where("book_id = ?", book.ID).Update("deleted_at", expiredAt).Error; err != nil {
		t.Fatal(err)
	}
	status, payload = trashRequest(t, ownerRouter, http.MethodGet, "/trash?type=book")
	if status != http.StatusOK || payload["data"].(map[string]any)["total"].(float64) != 0 {
		t.Fatalf("过期书籍不应继续展示: %d %v", status, payload)
	}
	if err := db.Unscoped().First(&models.Book{}, book.ID).Error; err != nil {
		t.Fatalf("回收站列表不应同步执行永久删除: %v", err)
	}
	if err := purgeExpiredTrash(db, currentTime()); err != nil {
		t.Fatalf("后台清理过期书籍失败: %v", err)
	}
	if err := db.Unscoped().First(&models.Book{}, book.ID).Error; err != gorm.ErrRecordNotFound {
		t.Fatalf("后台维护任务应永久删除过期书籍: %v", err)
	}
}
