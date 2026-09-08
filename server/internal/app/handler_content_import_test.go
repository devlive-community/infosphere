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
	"strconv"
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
	router.POST("/books/:id/documents/import-web", app.ImportWebDocument)
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
			Markdown: "这是导入文件的前言，包含足够多的文字用于解析。\n\n第一段介绍。\n\n## 第一章 起步\n\n这是第一章的正文内容。\n\n## 第二章 深入\n\n这是第二章的正文内容。",
			Pages:    12,
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
	if !strings.Contains(doc.Content, "# 动态文章") || !strings.Contains(doc.Content, "[继续阅读指南](https://8.8.8.8/guide)") || strings.Contains(doc.Content, "导航") {
		t.Fatalf("正文提取或相对链接转换错误: %s", doc.Content)
	}
}

func TestExtractWebArticlePreservesMarkdownStructure(t *testing.T) {
	pageURL, _ := url.Parse("https://8.8.8.8/articles/markdown")
	article, err := extractWebArticle(webPage{
		FinalURL: pageURL,
		HTML: `<html><head><title>结构化文章</title></head><body><main><article>
			<h1>结构化文章</h1><h2>安装步骤</h2><p>请先阅读 <strong>注意事项</strong>。</p>
			<ul><li>准备环境</li><li>安装依赖</li></ul>
			<pre><code class="language-go">fmt.Println("ok")</code></pre>
			<table><tr><th>名称</th><th>状态</th></tr><tr><td>导入</td><td>正常</td></tr></table>
		</article></main></body></html>`,
	})
	if err != nil {
		t.Fatalf("网页 Markdown 转换失败: %v", err)
	}
	for _, expected := range []string{"# 结构化文章", "## 安装步骤", "**注意事项**", "- 准备环境", "```go", "| 名称", "|----"} {
		if !strings.Contains(article.Markdown, expected) {
			t.Fatalf("网页结构未转换为 Markdown，缺少 %q:\n%s", expected, article.Markdown)
		}
	}
}

func TestRenderPDFMarkdownPreservesDocumentStructure(t *testing.T) {
	lines := []pdfLayoutLine{
		{Text: "工程实践指南", FontSize: 24, Bold: true, Page: 1, X: 60, Y: 780, GapAfter: 30},
		{Text: "第一章 起步", FontSize: 18, Bold: true, Page: 1, X: 60, Y: 730, GapAfter: 24},
		{Text: "这是跨行的第一部分，", FontSize: 12, Page: 1, X: 60, Y: 690, GapAfter: 14},
		{Text: "应该合并为一个段落。", FontSize: 12, Page: 1, X: 60, Y: 676, GapAfter: 30},
		{Text: "• 准备环境", FontSize: 12, Page: 1, X: 60, Y: 630, GapAfter: 18},
		{Text: `fmt.Println("ok")`, Font: "Courier", FontSize: 11, Monospace: true, Page: 1, X: 60, Y: 600},
	}
	markdown := renderPDFMarkdown(lines)
	for _, expected := range []string{"# 工程实践指南", "## 第一章 起步", "这是跨行的第一部分，应该合并为一个段落。", "- 准备环境", "~~~\nfmt.Println"} {
		if !strings.Contains(markdown, expected) {
			t.Fatalf("PDF 结构未转换为 Markdown，缺少 %q:\n%s", expected, markdown)
		}
	}
}

func TestOrderPDFPageLinesReadsColumnsTopToBottom(t *testing.T) {
	lines := []pdfLayoutLine{
		{Text: "页面标题", X: 40, EndX: 560, Y: 780, Page: 1},
		{Text: "左一", X: 40, EndX: 220, Y: 720, Page: 1}, {Text: "右一", X: 340, EndX: 520, Y: 720, Page: 1},
		{Text: "左二", X: 40, EndX: 220, Y: 680, Page: 1}, {Text: "右二", X: 340, EndX: 520, Y: 680, Page: 1},
		{Text: "左三", X: 40, EndX: 220, Y: 640, Page: 1}, {Text: "右三", X: 340, EndX: 520, Y: 640, Page: 1},
	}
	ordered := orderPDFPageLines(lines)
	got := make([]string, 0, len(ordered))
	for _, line := range ordered {
		got = append(got, line.Text)
	}
	want := []string{"页面标题", "左一", "左二", "左三", "右一", "右二", "右三"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("双栏阅读顺序错误: got=%v want=%v", got, want)
	}
}

func TestSplitPDFChaptersUsesMarkdownHeadings(t *testing.T) {
	chapters := splitPDFChapters("# 使用手册\n\n手册前言内容。\n\n## 安装\n\n安装章节内容。\n\n## 配置\n\n配置章节内容。", "使用手册")
	if len(chapters) != 3 || chapters[0].Title != "使用手册" || chapters[1].Title != "安装" || chapters[2].Title != "配置" {
		t.Fatalf("Markdown 标题拆章错误: %+v", chapters)
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

func TestImportWebDocumentRemovesPageChromeAndCreatesRevision(t *testing.T) {
	app, owner, db := newContentImportTestApp(t)
	book := models.Book{Title: "采集测试书", Slug: "collect-test", UserID: owner.ID, Status: "draft", IsPublic: false}
	if err := db.Create(&book).Error; err != nil {
		t.Fatal(err)
	}
	parent := models.Document{BookID: book.ID, UserID: owner.ID, Title: "资料", Slug: "sources", Status: "draft"}
	if err := db.Create(&parent).Error; err != nil {
		t.Fatal(err)
	}
	app.WebFetcher = func(_ context.Context, target *url.URL) (webPage, error) {
		return webPage{
			HTML: `<html><head><title>需要的正文</title></head><body>
			<header>站点标题和登录注册</header><nav>全站导航</nav>
			<main><article class="article-content"><h1>需要的正文</h1>
			<p>这是需要采集到书籍章节里的主要文章内容，应当被完整保留下来。</p>
			<aside>作者推荐</aside><div class="ad-container">广告内容</div>
			<div id="comments">读者评论</div><div class="article-footer">分享与相关推荐</div>
			</article></main><footer>备案信息与版权导航</footer></body></html>`,
			FinalURL: target,
		}, nil
	}
	router := contentImportRouter(app, owner)
	body := `{"url":"https://8.8.8.8/posts/clean","render_mode":"static","parent_id":` + strconv.FormatUint(uint64(parent.ID), 10) + `,"sort_order":3}`
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/books/"+strconv.FormatUint(uint64(book.ID), 10)+"/documents/import-web", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("采集网页章节失败: %d %v", recorder.Code, decodeImportResponse(t, recorder))
	}

	var doc models.Document
	if err := db.Where("book_id = ? AND id <> ?", book.ID, parent.ID).First(&doc).Error; err != nil {
		t.Fatal(err)
	}
	if doc.Status != "draft" || doc.ParentID == nil || *doc.ParentID != parent.ID || doc.SortOrder != 3 {
		t.Fatalf("采集章节结构错误: %+v", doc)
	}
	for _, noise := range []string{"站点标题", "全站导航", "作者推荐", "广告内容", "读者评论", "分享与相关推荐", "备案信息"} {
		if strings.Contains(doc.Content, noise) {
			t.Fatalf("采集正文包含页面噪声 %q: %s", noise, doc.Content)
		}
	}
	if !strings.Contains(doc.Content, "主要文章内容") || !strings.Contains(doc.Content, "[原始网页](https://8.8.8.8/posts/clean)") {
		t.Fatalf("采集正文或来源链接缺失: %s", doc.Content)
	}
	var revision models.DocumentRevision
	if err := db.Where("document_id = ? AND reason = ?", doc.ID, "create").First(&revision).Error; err != nil {
		t.Fatalf("采集章节未生成初始版本: %v", err)
	}

	viewer := &models.User{Username: "import-viewer", Email: "import-viewer@test.local", IsActive: true}
	if err := db.Create(viewer).Error; err != nil {
		t.Fatal(err)
	}
	viewerRouter := contentImportRouter(app, viewer)
	denied := httptest.NewRecorder()
	deniedRequest := httptest.NewRequest(http.MethodPost, "/books/"+strconv.FormatUint(uint64(book.ID), 10)+"/documents/import-web", strings.NewReader(body))
	deniedRequest.Header.Set("Content-Type", "application/json")
	viewerRouter.ServeHTTP(denied, deniedRequest)
	if denied.Code != http.StatusNotFound {
		t.Fatalf("无权用户采集私有书籍时应统一返回 404: %d", denied.Code)
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

func TestWebImportErrorHidesBrowserDiagnostics(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	failWebImport(ctx, errors.New("无法启动 Chromium: [launcher] Failed to get the debug url:\nchrome_crashpad_handler: --database is required\ninternal stack trace"))
	payload := decodeImportResponse(t, recorder)
	message, _ := payload["message"].(string)
	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("浏览器启动失败状态码错误: %d", recorder.Code)
	}
	if strings.Contains(message, "crashpad") || strings.Contains(message, "stack trace") || len([]rune(message)) > 160 {
		t.Fatalf("浏览器内部诊断不应返回前端: %q", message)
	}
	if !strings.Contains(message, "浏览器启动失败") {
		t.Fatalf("应返回可理解的浏览器错误提示: %q", message)
	}
}
