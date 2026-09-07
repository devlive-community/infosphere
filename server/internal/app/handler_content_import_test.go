package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"

	"infosphere/server/internal/config"
	"infosphere/server/internal/database"
	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func newContentImportTestApp(t *testing.T) (*App, *models.User, *gorm.DB) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db, err := database.Open(config.DatabaseConfig{
		Type: database.TypeSQLite,
		Path: filepath.Join(t.TempDir(), "content-import.db"),
	})
	if err != nil {
		t.Fatalf("打开测试数据库失败: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("获取测试数据库连接失败: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := models.All(db); err != nil {
		t.Fatalf("迁移测试数据库失败: %v", err)
	}
	user := &models.User{Username: "import-owner", Email: "import-owner@test.local", IsActive: true}
	if err := db.Create(user).Error; err != nil {
		t.Fatalf("创建测试用户失败: %v", err)
	}
	return &App{DB: db}, user, db
}

func contentImportRouter(app *App, user *models.User) *gin.Engine {
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("user", user)
		c.Next()
	})
	router.POST("/import/pdf", app.ImportPDFBook)
	router.POST("/import/web", app.ImportWebBook)
	return router
}

func decodeImportResponse(t *testing.T, recorder *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var payload map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("解析响应失败: %v, body=%s", err, recorder.Body.String())
	}
	return payload
}

func TestImportPDFBookCreatesPrivateDraftAndRevisions(t *testing.T) {
	app, owner, db := newContentImportTestApp(t)
	app.PDFExtractor = func(path string) (pdfExtractResult, error) {
		return pdfExtractResult{
			Text:  "这是导入文件的前言，包含足够多的文字用于解析。\n\n第一段介绍。\n\n第一章 起步\n这是第一章的正文内容。\n\n第二章 深入\n这是第二章的正文内容。",
			Pages: 12,
		}, nil
	}
	router := contentImportRouter(app, owner)

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "知识手册.pdf")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = part.Write([]byte("%PDF-test-content"))
	_ = writer.WriteField("title", "导入测试书")
	_ = writer.Close()

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/import/pdf", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	router.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("PDF 导入失败: %d %v", recorder.Code, decodeImportResponse(t, recorder))
	}

	var book models.Book
	if err := db.Where("user_id = ?", owner.ID).First(&book).Error; err != nil {
		t.Fatalf("未创建书籍: %v", err)
	}
	if book.Title != "导入测试书" || book.Status != "draft" || book.IsPublic {
		t.Fatalf("导入书籍必须是私有草稿: %+v", book)
	}
	var docs []models.Document
	if err := db.Where("book_id = ?", book.ID).Order("sort_order ASC").Find(&docs).Error; err != nil {
		t.Fatal(err)
	}
	if len(docs) != 3 || docs[1].Title != "第一章 起步" || docs[2].Title != "第二章 深入" {
		t.Fatalf("PDF 章节拆分错误: %+v", docs)
	}
	var revisionCount int64
	if err := db.Model(&models.DocumentRevision{}).Where("book_id = ? AND reason = ?", book.ID, "create").Count(&revisionCount).Error; err != nil {
		t.Fatal(err)
	}
	if revisionCount != int64(len(docs)) {
		t.Fatalf("每个导入章节都应有初始版本: got=%d want=%d", revisionCount, len(docs))
	}
}

func TestImportWebAutoFallsBackToBrowser(t *testing.T) {
	app, owner, db := newContentImportTestApp(t)
	fetchCalled := false
	renderCalled := false
	app.WebFetcher = func(_ context.Context, target *url.URL) (webPage, error) {
		fetchCalled = true
		return webPage{
			HTML:     `<html><head><title>页面壳</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>`,
			FinalURL: target,
		}, nil
	}
	app.WebRenderer = func(_ context.Context, target *url.URL) (webPage, error) {
		renderCalled = true
		return webPage{
			HTML:     `<html><head><title>动态文章</title><meta name="description" content="动态网页导入测试"></head><body><nav>导航</nav><main><h1>动态文章</h1><p>这是由 JavaScript 渲染出来的文章正文，内容完整并且可以转换为 Markdown。</p><p><a href="/guide">继续阅读指南</a></p></main></body></html>`,
			FinalURL: target,
		}, nil
	}
	router := contentImportRouter(app, owner)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/import/web", strings.NewReader(`{"url":"https://8.8.8.8/articles/one","render_mode":"auto"}`))
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, request)
	payload := decodeImportResponse(t, recorder)
	if recorder.Code != http.StatusOK {
		t.Fatalf("网页导入失败: %d %v", recorder.Code, payload)
	}
	if !fetchCalled || !renderCalled {
		t.Fatalf("自动模式应先静态抓取再回退浏览器: fetch=%v render=%v", fetchCalled, renderCalled)
	}
	data := payload["data"].(map[string]any)
	if data["render_mode"] != "browser" {
		t.Fatalf("响应未标记浏览器渲染: %v", data)
	}

	var book models.Book
	if err := db.Where("user_id = ?", owner.ID).First(&book).Error; err != nil {
		t.Fatal(err)
	}
	var doc models.Document
	if err := db.Where("book_id = ?", book.ID).First(&doc).Error; err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(doc.Content, "https://8.8.8.8/guide") || strings.Contains(doc.Content, "导航") {
		t.Fatalf("正文提取或相对链接转换错误: %s", doc.Content)
	}
}

func TestImportWebAutoUsesBrowserWhenStaticFetchFails(t *testing.T) {
	app, owner, _ := newContentImportTestApp(t)
	app.WebFetcher = func(_ context.Context, _ *url.URL) (webPage, error) {
		return webPage{}, errors.New("static endpoint denied")
	}
	app.WebRenderer = func(_ context.Context, target *url.URL) (webPage, error) {
		return webPage{
			HTML:     `<html><head><title>浏览器文章</title></head><body><article><h1>浏览器文章</h1><p>静态请求失败后，浏览器仍然成功渲染出了足够长度的正文内容。</p></article></body></html>`,
			FinalURL: target,
		}, nil
	}
	router := contentImportRouter(app, owner)
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/import/web", strings.NewReader(`{"url":"https://8.8.8.8/articles/two","render_mode":"auto"}`))
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, request)
	payload := decodeImportResponse(t, recorder)
	if recorder.Code != http.StatusOK || payload["data"].(map[string]any)["render_mode"] != "browser" {
		t.Fatalf("静态失败后应回退浏览器: status=%d payload=%v", recorder.Code, payload)
	}
}

func TestImportWebRejectsPrivateAndUnsupportedURLs(t *testing.T) {
	app, owner, _ := newContentImportTestApp(t)
	router := contentImportRouter(app, owner)
	for _, rawURL := range []string{"http://127.0.0.1/admin", "http://localhost/secret", "file:///etc/passwd"} {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodPost, "/import/web", strings.NewReader(`{"url":"`+rawURL+`"}`))
		request.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(recorder, request)
		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("危险 URL 应被拒绝: url=%s status=%d body=%s", rawURL, recorder.Code, recorder.Body.String())
		}
	}
}

func TestSplitPDFChaptersChunksLongUnstructuredText(t *testing.T) {
	chapters := splitPDFChapters(strings.Repeat("内容片段 ", 5000), "长文档")
	if len(chapters) < 2 {
		t.Fatalf("超长无结构内容应被拆分: %d", len(chapters))
	}
	for _, chapter := range chapters {
		if len([]rune(chapter.Content)) > 12000 {
			t.Fatalf("单章超过导入上限: %d", len([]rune(chapter.Content)))
		}
	}
}
