package app

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"infosphere/server/internal/config"
	"infosphere/server/internal/models"

	"github.com/JohannesKaufmann/html-to-markdown/v2/converter"
	"github.com/JohannesKaufmann/html-to-markdown/v2/plugin/base"
	"github.com/JohannesKaufmann/html-to-markdown/v2/plugin/commonmark"
	"github.com/JohannesKaufmann/html-to-markdown/v2/plugin/table"
	"github.com/gin-gonic/gin"
	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
	"github.com/go-rod/rod/lib/proto"
	"golang.org/x/net/html"
	"golang.org/x/net/html/charset"
	"gorm.io/gorm"
)

const (
	contentImportMaxBytes = 64 << 20
	webImportMaxHTMLBytes = 12 << 20
	webResourceMaxBytes   = 16 << 20
	maxImportedChapters   = 200
)

type importedChapter struct {
	Title   string
	Content string
}

type pdfExtractResult struct {
	Markdown string
	Pages    int
}

type uploadedPDF struct {
	Filename string
	Result   pdfExtractResult
}

type webPage struct {
	HTML     string
	FinalURL *url.URL
}

type webImportPayload struct {
	URL        string `json:"url"`
	Title      string `json:"title"`
	RenderMode string `json:"render_mode"` // auto | static | browser
	ParentID   *uint  `json:"parent_id,omitempty"`
	SortOrder  *int   `json:"sort_order,omitempty"`
}

type webArticle struct {
	Title       string
	Description string
	Markdown    string
}

var pdfChapterHeading = regexp.MustCompile(`(?i)^(?:第[零一二三四五六七八九十百千万两0-9]{1,12}[章节篇部卷]|chapter\s+[0-9ivxlcdm]+)(?:[\s　:：.、-]+.+)?$`)

// ImportPDFBook POST /import/pdf 上传 PDF 并建立草稿书籍。
func (a *App) ImportPDFBook(c *gin.Context) {
	u := currentUser(c)
	upload, status, err := a.extractUploadedPDF(c)
	if err != nil {
		fail(c, status, err.Error())
		return
	}

	name := upload.Filename
	bookTitle := strings.TrimSpace(strings.TrimSuffix(name, filepath.Ext(name)))
	if custom := strings.TrimSpace(c.PostForm("title")); custom != "" {
		bookTitle = custom
	}
	bookTitle = truncateText(bookTitle, 255)
	chapters := splitPDFChapters(upload.Result.Markdown, bookTitle)
	book, err := a.createContentImportBook(u, bookTitle,
		fmt.Sprintf("从 PDF 导入，共 %d 页。", upload.Result.Pages), chapters)
	if err != nil {
		fail(c, http.StatusInternalServerError, "创建 PDF 书籍失败: "+err.Error())
		return
	}
	ok(c, gin.H{
		"book": book, "imported_doc": len(chapters), "source": "pdf",
		"message": fmt.Sprintf("导入完成：《%s》共 %d 个章节", book.Title, len(chapters)),
	})
}

// ReimportPDFBook POST /books/:id/import/pdf 将 PDF 章节追加到已有书籍，或原子覆盖全部旧章节。
func (a *App) ReimportPDFBook(c *gin.Context) {
	book, status := a.findBook(c)
	if book == nil {
		fail(c, status, "书籍不存在")
		return
	}
	u := currentUser(c)
	// 重新导入会批量改写整本书，只允许书籍所有者或管理员操作。
	if !a.canManageBook(u, book) {
		fail(c, http.StatusNotFound, "书籍不存在")
		return
	}
	mode := strings.ToLower(strings.TrimSpace(c.PostForm("mode")))
	if mode == "" {
		mode = "append"
	}
	if mode != "append" && mode != "replace" {
		fail(c, http.StatusBadRequest, "导入方式必须为 append 或 replace")
		return
	}

	upload, uploadStatus, err := a.extractUploadedPDF(c)
	if err != nil {
		fail(c, uploadStatus, err.Error())
		return
	}
	chapters := splitPDFChapters(upload.Result.Markdown, book.Title)
	if len(chapters) == 0 || len(chapters) > maxImportedChapters {
		fail(c, http.StatusUnprocessableEntity, "没有可导入的章节或章节数量过多")
		return
	}

	removed := int64(0)
	err = a.DB.Transaction(func(tx *gorm.DB) error {
		startOrder := 0
		usedSlugs := map[string]bool{}
		if mode == "replace" {
			var ids []uint
			if err := tx.Model(&models.Document{}).Where("book_id = ?", book.ID).Pluck("id", &ids).Error; err != nil {
				return err
			}
			removed = int64(len(ids))
			if len(ids) > 0 {
				if err := tx.Where("document_id IN ?", ids).Delete(&models.Comment{}).Error; err != nil {
					return err
				}
				if err := tx.Where("document_id IN ?", ids).Delete(&models.DocumentRevision{}).Error; err != nil {
					return err
				}
				if err := tx.Where("doc_id IN ?", ids).Delete(&models.ReadChapter{}).Error; err != nil {
					return err
				}
				if err := tx.Where("document_id IN ?", ids).Delete(&models.ReadingAnnotation{}).Error; err != nil {
					return err
				}
				if err := tx.Unscoped().Where("id IN ?", ids).Delete(&models.Document{}).Error; err != nil {
					return err
				}
			}
			if err := tx.Where("book_id = ?", book.ID).Delete(&models.ReadingProgress{}).Error; err != nil {
				return err
			}
			// 新内容必须重新审阅后发布，避免覆盖后直接暴露未校对内容。
			if err := tx.Model(book).Updates(map[string]any{"status": "draft", "is_public": false}).Error; err != nil {
				return err
			}
		} else {
			var slugs []string
			if err := tx.Unscoped().Model(&models.Document{}).Where("book_id = ?", book.ID).Pluck("slug", &slugs).Error; err != nil {
				return err
			}
			for _, slug := range slugs {
				usedSlugs[slug] = true
			}
			if err := tx.Model(&models.Document{}).Where("book_id = ?", book.ID).
				Select("COALESCE(MAX(sort_order), -1)").Scan(&startOrder).Error; err != nil {
				return err
			}
			startOrder++
		}
		return createImportedChapters(tx, book.ID, book.UserID, u.ID, chapters, startOrder, usedSlugs)
	})
	if err != nil {
		fail(c, http.StatusInternalServerError, "重新导入 PDF 失败: "+err.Error())
		return
	}

	message := fmt.Sprintf("已追加 %d 个草稿章节", len(chapters))
	if mode == "replace" {
		message = fmt.Sprintf("已覆盖 %d 个旧章节并导入 %d 个草稿章节，书籍已转为私有草稿", removed, len(chapters))
	}
	ok(c, gin.H{
		"book_id": book.ID, "mode": mode, "removed_doc": removed,
		"imported_doc": len(chapters), "pages": upload.Result.Pages, "message": message,
	})
}

func (a *App) extractUploadedPDF(c *gin.Context) (uploadedPDF, int, error) {
	header, err := c.FormFile("file")
	if err != nil {
		return uploadedPDF{}, http.StatusBadRequest, errors.New("请选择要导入的 PDF 文件")
	}
	if header.Size <= 0 || header.Size > contentImportMaxBytes {
		return uploadedPDF{}, http.StatusBadRequest, errors.New("PDF 文件必须小于 64MB")
	}
	name := strings.TrimSpace(header.Filename)
	if ext := strings.ToLower(filepath.Ext(name)); ext != ".pdf" {
		return uploadedPDF{}, http.StatusBadRequest, errors.New("仅支持 PDF 文件")
	}

	source, err := header.Open()
	if err != nil {
		return uploadedPDF{}, http.StatusBadRequest, errors.New("读取 PDF 文件失败")
	}
	defer source.Close()
	magic := make([]byte, 5)
	if _, err := io.ReadFull(source, magic); err != nil || string(magic) != "%PDF-" {
		return uploadedPDF{}, http.StatusBadRequest, errors.New("文件内容不是有效的 PDF")
	}
	if _, err := source.Seek(0, io.SeekStart); err != nil {
		return uploadedPDF{}, http.StatusBadRequest, errors.New("读取 PDF 文件失败")
	}

	temp, err := os.CreateTemp("", "infosphere-import-*.pdf")
	if err != nil {
		return uploadedPDF{}, http.StatusInternalServerError, errors.New("准备 PDF 解析失败")
	}
	tempPath := temp.Name()
	defer os.Remove(tempPath)
	if _, err := io.Copy(temp, io.LimitReader(source, contentImportMaxBytes+1)); err != nil {
		temp.Close()
		return uploadedPDF{}, http.StatusBadRequest, errors.New("读取 PDF 文件失败")
	}
	if err := temp.Close(); err != nil {
		return uploadedPDF{}, http.StatusInternalServerError, errors.New("准备 PDF 解析失败")
	}

	extractor := a.PDFExtractor
	if extractor == nil {
		extractor = extractPDFText
	}
	extracted, err := extractor(tempPath)
	if err != nil {
		return uploadedPDF{}, http.StatusUnprocessableEntity, errors.New("PDF 解析失败: " + err.Error())
	}
	if utf8.RuneCountInString(strings.TrimSpace(extracted.Markdown)) < 20 {
		return uploadedPDF{}, http.StatusUnprocessableEntity, errors.New("PDF 中未识别到可导入文字；扫描版 PDF 需要先完成 OCR")
	}
	return uploadedPDF{Filename: name, Result: extracted}, http.StatusOK, nil
}

// ImportWebBook POST /import/web 抓取静态或 JavaScript 渲染后的网页并建立草稿书籍。
func (a *App) ImportWebBook(c *gin.Context) {
	u := currentUser(c)
	var req webImportPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
	defer cancel()
	article, page, usedMode, err := a.collectWebArticle(ctx, req)
	if err != nil {
		failWebImport(c, err)
		return
	}
	if customTitle := strings.TrimSpace(req.Title); customTitle != "" {
		article.Title = truncateText(customTitle, 255)
	}
	chapter := importedChapter{Title: "正文", Content: article.Markdown}
	book, err := a.createContentImportBook(u, article.Title, article.Description, []importedChapter{chapter})
	if err != nil {
		fail(c, http.StatusInternalServerError, "创建网页书籍失败: "+err.Error())
		return
	}
	ok(c, gin.H{
		"book": book, "imported_doc": 1, "source": "web", "render_mode": usedMode,
		"source_url": page.FinalURL.String(),
		"message":    fmt.Sprintf("导入完成：《%s》已创建为草稿", book.Title),
	})
}

// ImportWebDocument POST /books/:id/documents/import-web 抓取网页并建立草稿章节。
func (a *App) ImportWebDocument(c *gin.Context) {
	book, status := a.findBook(c)
	if book == nil {
		fail(c, status, "书籍不存在")
		return
	}
	u := currentUser(c)
	if !a.canEditBookContent(u, book) {
		fail(c, http.StatusNotFound, "书籍不存在")
		return
	}
	var req webImportPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if req.ParentID != nil {
		var count int64
		if err := a.DB.Model(&models.Document{}).Where("id = ? AND book_id = ?", *req.ParentID, book.ID).Count(&count).Error; err != nil {
			fail(c, http.StatusInternalServerError, "校验父章节失败")
			return
		}
		if count == 0 {
			fail(c, http.StatusBadRequest, "父章节不存在")
			return
		}
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
	defer cancel()
	article, page, usedMode, err := a.collectWebArticle(ctx, req)
	if err != nil {
		failWebImport(c, err)
		return
	}
	if customTitle := strings.TrimSpace(req.Title); customTitle != "" {
		article.Title = truncateText(customTitle, 255)
	}
	content := strings.TrimSpace(article.Markdown) + "\n\n> 来源：[原始网页](" + page.FinalURL.String() + ")"
	doc, err := a.createImportedWebDocument(book, u, article.Title, content, req.ParentID, req.SortOrder)
	if err != nil {
		fail(c, http.StatusInternalServerError, "创建网页章节失败: "+err.Error())
		return
	}
	ok(c, gin.H{
		"document": doc, "source_url": page.FinalURL.String(), "render_mode": usedMode,
		"message": fmt.Sprintf("已采集为草稿章节《%s》", doc.Title),
	})
}

func (a *App) collectWebArticle(ctx context.Context, req webImportPayload) (webArticle, webPage, string, error) {
	mode := strings.ToLower(strings.TrimSpace(req.RenderMode))
	if mode == "" {
		mode = "auto"
	}
	if mode != "auto" && mode != "static" && mode != "browser" {
		return webArticle{}, webPage{}, "", errors.New("render_mode 必须为 auto、static 或 browser")
	}
	target, err := validateImportURL(req.URL)
	if err != nil {
		return webArticle{}, webPage{}, "", err
	}
	fetcher := a.WebFetcher
	if fetcher == nil {
		fetcher = fetchStaticWebPage
	}
	renderer := a.WebRenderer
	if renderer == nil {
		renderer = renderDynamicWebPage
	}

	usedMode := mode
	var page webPage
	if mode == "browser" {
		page, err = renderer(ctx, target)
	} else {
		page, err = fetcher(ctx, target)
		if mode == "auto" && err != nil {
			staticErr := err
			page, err = renderer(ctx, target)
			if err == nil {
				usedMode = "browser"
			} else {
				err = fmt.Errorf("静态抓取失败（%v），浏览器渲染也失败: %w", staticErr, err)
			}
		} else if mode == "auto" {
			article, parseErr := extractWebArticle(page)
			if parseErr == nil && !shouldRenderSPA(page.HTML, article.Markdown) {
				usedMode = "static"
			} else if rendered, renderErr := renderer(ctx, target); renderErr == nil {
				page = rendered
				usedMode = "browser"
			} else if parseErr != nil || utf8.RuneCountInString(strings.TrimSpace(article.Markdown)) < 100 {
				err = fmt.Errorf("网页需要 JavaScript 渲染，但浏览器渲染失败: %w", renderErr)
			} else {
				usedMode = "static"
			}
		}
	}
	if err != nil {
		return webArticle{}, webPage{}, "", err
	}
	article, err := extractWebArticle(page)
	if err != nil {
		return webArticle{}, webPage{}, "", fmt.Errorf("网页正文解析失败: %w", err)
	}
	return article, page, usedMode, nil
}

func failWebImport(c *gin.Context, err error) {
	rawMessage := err.Error()
	status := http.StatusUnprocessableEntity
	if strings.Contains(rawMessage, "render_mode") || strings.Contains(rawMessage, "网页地址") || strings.Contains(rawMessage, "不允许访问") {
		status = http.StatusBadRequest
	}
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		status = http.StatusGatewayTimeout
	}
	log.Printf("web content import failed: %v", err)
	fail(c, status, "网页获取失败: "+publicWebImportError(err))
}

func publicWebImportError(err error) string {
	message := err.Error()
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return "处理超时，请稍后重试或改用静态抓取"
	}
	if strings.Contains(message, "Chromium") || strings.Contains(message, "debug url") || strings.Contains(message, "crashpad") {
		return "服务器浏览器启动失败，请联系管理员检查 Chromium 运行环境，或尝试静态抓取"
	}
	for _, safeMessage := range []string{
		"render_mode", "网页地址", "不允许访问", "无法解析网页地址", "网页返回状态码",
		"目标地址返回的不是 HTML", "网页内容超过", "网页正文", "重定向次数过多",
	} {
		if strings.Contains(message, safeMessage) {
			return truncateText(strings.Join(strings.Fields(message), " "), 300)
		}
	}
	return "无法获取或解析网页正文，请检查地址后重试"
}

func (a *App) createImportedWebDocument(book *models.Book, u *models.User, title, content string, parentID *uint, sortOrder *int) (models.Document, error) {
	title = truncateText(strings.TrimSpace(title), 255)
	if title == "" {
		title = "采集的网页"
	}
	allowComments := true
	doc := models.Document{
		BookID: book.ID, UserID: u.ID, Title: title, Content: strings.TrimSpace(content),
		ParentID: parentID, Status: "draft", AllowComments: &allowComments,
	}
	if sortOrder != nil {
		doc.SortOrder = *sortOrder
	}
	baseSlug := slugify(title)
	if baseSlug == "" {
		baseSlug = randomSlug("doc")
	}
	err := a.DB.Transaction(func(tx *gorm.DB) error {
		availableSlug := false
		for suffix := 1; suffix <= 50; suffix++ {
			doc.Slug = baseSlug
			if suffix > 1 {
				doc.Slug = fmt.Sprintf("%s-%d", baseSlug, suffix)
			}
			var count int64
			if err := tx.Model(&models.Document{}).Where("book_id = ? AND slug = ?", book.ID, doc.Slug).Count(&count).Error; err != nil {
				return err
			}
			if count == 0 {
				availableSlug = true
				break
			}
		}
		if !availableSlug {
			return errors.New("章节 slug 生成失败")
		}
		if err := tx.Create(&doc).Error; err != nil {
			return err
		}
		revision := newDocumentRevision(&doc, u.ID, "create")
		return tx.Create(&revision).Error
	})
	return doc, err
}

func splitPDFChapters(text, bookTitle string) []importedChapter {
	text = normalizeExtractedText(text)
	lines := strings.Split(text, "\n")
	chapters := make([]importedChapter, 0)
	currentTitle := ""
	currentLines := make([]string, 0)
	flush := func() {
		body := strings.TrimSpace(strings.Join(currentLines, "\n"))
		if body == "" {
			return
		}
		title := strings.TrimSpace(currentTitle)
		if title == "" {
			title = "前言"
		}
		chapters = append(chapters, importedChapter{Title: truncateText(title, 255), Content: body})
		currentLines = currentLines[:0]
	}
	foundHeading := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		headingText := strings.TrimSpace(strings.TrimLeft(trimmed, "#"))
		headingLevel := len(trimmed) - len(strings.TrimLeft(trimmed, "#"))
		markdownChapter := headingLevel > 0 && headingLevel <= 2 && strings.HasPrefix(trimmed[headingLevel:], " ")
		if headingText != "" && utf8.RuneCountInString(headingText) <= 100 && (pdfChapterHeading.MatchString(headingText) || markdownChapter) {
			flush()
			currentTitle = headingText
			foundHeading = true
			continue
		}
		currentLines = append(currentLines, line)
	}
	flush()
	if foundHeading && len(chapters) > 0 && len(chapters) <= maxImportedChapters {
		return chapters
	}
	return chunkImportedText(text, bookTitle)
}

func chunkImportedText(text, fallbackTitle string) []importedChapter {
	const maxRunes = 12000
	paragraphs := strings.Split(text, "\n\n")
	chunks := make([]string, 0)
	var current strings.Builder
	for _, paragraph := range paragraphs {
		paragraph = strings.TrimSpace(paragraph)
		if paragraph == "" {
			continue
		}
		paragraphRunes := []rune(paragraph)
		for len(paragraphRunes) > maxRunes {
			if current.Len() > 0 {
				chunks = append(chunks, strings.TrimSpace(current.String()))
				current.Reset()
			}
			cut := maxRunes
			for i := maxRunes; i > maxRunes*3/4; i-- {
				if paragraphRunes[i-1] == '\n' || unicode.IsSpace(paragraphRunes[i-1]) {
					cut = i
					break
				}
			}
			chunks = append(chunks, strings.TrimSpace(string(paragraphRunes[:cut])))
			paragraphRunes = paragraphRunes[cut:]
		}
		paragraph = strings.TrimSpace(string(paragraphRunes))
		if paragraph == "" {
			continue
		}
		if current.Len() > 0 && utf8.RuneCountInString(current.String())+utf8.RuneCountInString(paragraph) > maxRunes {
			chunks = append(chunks, strings.TrimSpace(current.String()))
			current.Reset()
		}
		if current.Len() > 0 {
			current.WriteString("\n\n")
		}
		current.WriteString(paragraph)
	}
	if current.Len() > 0 {
		chunks = append(chunks, strings.TrimSpace(current.String()))
	}
	if len(chunks) == 0 {
		return nil
	}
	chapters := make([]importedChapter, 0, len(chunks))
	for i, chunk := range chunks {
		title := fallbackTitle
		if len(chunks) > 1 {
			title = fmt.Sprintf("第 %d 部分", i+1)
		}
		chapters = append(chapters, importedChapter{Title: truncateText(title, 255), Content: chunk})
	}
	return chapters
}

func normalizeExtractedText(text string) string {
	text = strings.ReplaceAll(text, "\x00", "")
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	lines := strings.Split(text, "\n")
	for i := range lines {
		lines[i] = strings.TrimRightFunc(lines[i], unicode.IsSpace)
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}

func (a *App) createContentImportBook(u *models.User, title, description string, chapters []importedChapter) (models.Book, error) {
	title = truncateText(strings.TrimSpace(title), 255)
	if title == "" {
		title = "导入的书籍"
	}
	if len(chapters) == 0 || len(chapters) > maxImportedChapters {
		return models.Book{}, errors.New("没有可导入的章节或章节数量过多")
	}
	book := models.Book{
		Title: title, Description: truncateText(strings.TrimSpace(description), 1000),
		Slug: a.uniqueBookSlug(slugify(title)), UserID: u.ID, Status: "draft",
		IsPublic: false, OrderCol: "created_at", OrderDir: "asc",
	}
	if book.Slug == "" {
		book.Slug = a.uniqueBookSlug(randomSlug("book"))
	}
	err := a.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&book).Error; err != nil {
			return err
		}
		return createImportedChapters(tx, book.ID, u.ID, u.ID, chapters, 0, map[string]bool{})
	})
	return book, err
}

func createImportedChapters(
	tx *gorm.DB,
	bookID, documentUserID, revisionUserID uint,
	chapters []importedChapter,
	startOrder int,
	usedSlugs map[string]bool,
) error {
	allowComments := true
	for index, chapter := range chapters {
		title := truncateText(strings.TrimSpace(chapter.Title), 255)
		if title == "" {
			title = fmt.Sprintf("第 %d 部分", index+1)
		}
		baseSlug := slugify(title)
		if baseSlug == "" {
			baseSlug = randomSlug("doc")
		}
		docSlug := baseSlug
		for suffix := 2; usedSlugs[docSlug]; suffix++ {
			docSlug = fmt.Sprintf("%s-%d", baseSlug, suffix)
		}
		usedSlugs[docSlug] = true
		doc := models.Document{
			BookID: bookID, UserID: documentUserID, Title: title,
			Slug: docSlug, Content: strings.TrimSpace(chapter.Content),
			SortOrder: startOrder + index, Status: "draft", AllowComments: &allowComments,
		}
		if err := tx.Create(&doc).Error; err != nil {
			return err
		}
		revision := newDocumentRevision(&doc, revisionUserID, "create")
		if err := tx.Create(&revision).Error; err != nil {
			return err
		}
	}
	return nil
}

func validateImportURL(raw string) (*url.URL, error) {
	target, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || target.Hostname() == "" {
		return nil, errors.New("请输入有效的网页地址")
	}
	if target.Scheme != "http" && target.Scheme != "https" {
		return nil, errors.New("网页地址仅支持 http 或 https")
	}
	if target.User != nil {
		return nil, errors.New("网页地址不能包含用户名或密码")
	}
	dnsContext, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := validatePublicHost(dnsContext, target.Hostname()); err != nil {
		return nil, err
	}
	return target, nil
}

func validatePublicHost(ctx context.Context, host string) error {
	host = strings.TrimSuffix(strings.ToLower(strings.TrimSpace(host)), ".")
	if host == "" || host == "localhost" || strings.HasSuffix(host, ".localhost") || strings.HasSuffix(host, ".local") {
		return errors.New("不允许访问本机或内网地址")
	}
	ips, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
	if err != nil || len(ips) == 0 {
		return errors.New("无法解析网页地址")
	}
	for _, ip := range ips {
		if !isPublicIP(ip) {
			return errors.New("不允许访问本机或内网地址")
		}
	}
	return nil
}

func isPublicIP(ip net.IP) bool {
	return ip != nil && !ip.IsLoopback() && !ip.IsPrivate() && !ip.IsUnspecified() &&
		!ip.IsLinkLocalUnicast() && !ip.IsLinkLocalMulticast() && !ip.IsMulticast()
}

func newSafeWebClient(ctx context.Context) *http.Client {
	dialer := &net.Dialer{Timeout: 10 * time.Second, KeepAlive: 20 * time.Second}
	transport := &http.Transport{
		DialContext: func(dialCtx context.Context, network, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil {
				return nil, err
			}
			ips, err := net.DefaultResolver.LookupIP(dialCtx, "ip", host)
			if err != nil || len(ips) == 0 {
				return nil, errors.New("无法解析网页地址")
			}
			for _, ip := range ips {
				if !isPublicIP(ip) {
					return nil, errors.New("不允许访问本机或内网地址")
				}
			}
			return dialer.DialContext(dialCtx, network, net.JoinHostPort(ips[0].String(), port))
		},
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 15 * time.Second,
		IdleConnTimeout:       30 * time.Second,
	}
	return &http.Client{
		Transport: &limitedResponseTransport{base: transport, limit: webResourceMaxBytes},
		Timeout:   30 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("网页重定向次数过多")
			}
			if req.URL.Scheme != "http" && req.URL.Scheme != "https" {
				return errors.New("网页重定向到了不支持的协议")
			}
			return validatePublicHost(ctx, req.URL.Hostname())
		},
	}
}

type limitedResponseTransport struct {
	base  http.RoundTripper
	limit int64
}

func (t *limitedResponseTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	response, err := t.base.RoundTrip(req)
	if err != nil {
		return nil, err
	}
	response.Body = &limitedReadCloser{Reader: io.LimitReader(response.Body, t.limit), Closer: response.Body}
	return response, nil
}

type limitedReadCloser struct {
	io.Reader
	io.Closer
}

func fetchStaticWebPage(ctx context.Context, target *url.URL) (webPage, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return webPage{}, err
	}
	request.Header.Set("User-Agent", "InfoSphere-Importer/1.0 (+https://infosphere.devlive.org)")
	request.Header.Set("Accept", "text/html,application/xhtml+xml")
	response, err := newSafeWebClient(ctx).Do(request)
	if err != nil {
		return webPage{}, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return webPage{}, fmt.Errorf("网页返回状态码 %d", response.StatusCode)
	}
	mediaType, _, _ := mime.ParseMediaType(response.Header.Get("Content-Type"))
	if mediaType != "" && mediaType != "text/html" && mediaType != "application/xhtml+xml" {
		return webPage{}, errors.New("目标地址返回的不是 HTML 网页")
	}
	decoded, err := charset.NewReader(response.Body, response.Header.Get("Content-Type"))
	if err != nil {
		return webPage{}, errors.New("无法识别网页字符编码")
	}
	data, err := io.ReadAll(io.LimitReader(decoded, webImportMaxHTMLBytes+1))
	if err != nil {
		return webPage{}, err
	}
	if len(data) > webImportMaxHTMLBytes {
		return webPage{}, errors.New("网页内容超过 12MB")
	}
	return webPage{HTML: string(data), FinalURL: response.Request.URL}, nil
}

func renderDynamicWebPage(ctx context.Context, target *url.URL) (webPage, error) {
	browserPath, found := launcher.LookPath()
	if !found {
		var err error
		browserPath, err = downloadManagedBrowser(ctx)
		if err != nil {
			return webPage{}, fmt.Errorf("无法准备 Chromium: %w", err)
		}
	}
	profileRoot := filepath.Join(config.DataDir(), "browser-profiles")
	if err := os.MkdirAll(profileRoot, 0o700); err != nil {
		return webPage{}, fmt.Errorf("无法准备 Chromium 配置目录: %w", err)
	}
	controlURL, profileDir, err := launchImportBrowser(ctx, browserPath, profileRoot)
	if err != nil && found {
		systemBrowserErr := err
		managedPath, downloadErr := downloadManagedBrowser(ctx)
		if downloadErr == nil && managedPath != browserPath {
			controlURL, profileDir, err = launchImportBrowser(ctx, managedPath, profileRoot)
		} else if downloadErr != nil {
			err = fmt.Errorf("系统 Chromium 启动失败（%v），备用浏览器准备失败: %w", systemBrowserErr, downloadErr)
		}
	}
	if err != nil {
		return webPage{}, fmt.Errorf("无法启动 Chromium: %w", err)
	}
	defer os.RemoveAll(profileDir)
	browser := rod.New().Context(ctx).ControlURL(controlURL)
	if err := browser.Connect(); err != nil {
		return webPage{}, err
	}
	defer browser.Close()

	client := newSafeWebClient(ctx)
	hijacker := browser.HijackRequests()
	if err := hijacker.Add("*", "", func(request *rod.Hijack) {
		method := request.Request.Method()
		if method != http.MethodGet && method != http.MethodHead && method != http.MethodPost {
			request.Response.Fail(proto.NetworkErrorReasonBlockedByClient)
			return
		}
		resourceType := request.Request.Type()
		if resourceType == proto.NetworkResourceTypeImage || resourceType == proto.NetworkResourceTypeMedia || resourceType == proto.NetworkResourceTypeFont {
			request.Response.Fail(proto.NetworkErrorReasonBlockedByClient)
			return
		}
		resourceURL := request.Request.URL()
		if resourceURL == nil || (resourceURL.Scheme != "http" && resourceURL.Scheme != "https") {
			request.Response.Fail(proto.NetworkErrorReasonBlockedByClient)
			return
		}
		if err := validatePublicHost(ctx, resourceURL.Hostname()); err != nil {
			request.Response.Fail(proto.NetworkErrorReasonBlockedByClient)
			return
		}
		if err := request.LoadResponse(client, true); err != nil {
			request.Response.Fail(proto.NetworkErrorReasonFailed)
		}
	}); err != nil {
		return webPage{}, err
	}
	go hijacker.Run()
	defer hijacker.Stop()

	page, err := browser.Page(proto.TargetCreateTarget{})
	if err != nil {
		return webPage{}, err
	}
	defer page.Close()
	waitIdle := page.WaitRequestIdle(750*time.Millisecond, nil, nil, nil)
	if err := page.Navigate(target.String()); err != nil {
		return webPage{}, err
	}
	if err := page.WaitLoad(); err != nil {
		return webPage{}, err
	}
	waitIdle()
	markup, err := page.HTML()
	if err != nil {
		return webPage{}, err
	}
	if len(markup) > webImportMaxHTMLBytes {
		return webPage{}, errors.New("渲染后的网页内容超过 12MB")
	}
	info, err := page.Info()
	if err != nil {
		return webPage{}, err
	}
	finalURL, err := url.Parse(info.URL)
	if err != nil {
		return webPage{}, err
	}
	if err := validatePublicHost(ctx, finalURL.Hostname()); err != nil {
		return webPage{}, err
	}
	return webPage{HTML: markup, FinalURL: finalURL}, nil
}

func downloadManagedBrowser(ctx context.Context) (string, error) {
	downloader := launcher.NewBrowser()
	downloader.Context = ctx
	downloader.RootDir = filepath.Join(config.DataDir(), "browser")
	return downloader.Get()
}

func launchImportBrowser(ctx context.Context, browserPath, profileRoot string) (string, string, error) {
	profileDir, err := os.MkdirTemp(profileRoot, "session-")
	if err != nil {
		return "", "", fmt.Errorf("无法准备 Chromium 配置目录: %w", err)
	}
	controlURL, err := launcher.New().
		Context(ctx).
		Bin(browserPath).
		UserDataDir(profileDir).
		Headless(true).
		NoSandbox(true).
		Leakless(false).
		Set("disable-crash-reporter").
		Set("disable-breakpad").
		Set("disable-features", "Crashpad").
		Set("no-first-run").
		Set("no-default-browser-check").
		Launch()
	if err != nil {
		_ = os.RemoveAll(profileDir)
		return "", "", err
	}
	return controlURL, profileDir, nil
}

func shouldRenderSPA(markup, markdown string) bool {
	textLength := utf8.RuneCountInString(strings.TrimSpace(stripHTMLText(markup)))
	contentLength := utf8.RuneCountInString(strings.TrimSpace(markdown))
	lower := strings.ToLower(markup)
	rootShell := strings.Contains(lower, `id="root"`) || strings.Contains(lower, `id="app"`) ||
		strings.Contains(lower, "__next_data__") || strings.Contains(lower, "data-reactroot")
	return contentLength < 300 || (rootShell && textLength < 1500)
}

func extractWebArticle(page webPage) (webArticle, error) {
	if page.FinalURL == nil {
		return webArticle{}, errors.New("网页地址缺失")
	}
	doc, err := html.Parse(strings.NewReader(page.HTML))
	if err != nil {
		return webArticle{}, err
	}
	title := firstMetaContent(doc, "property", "og:title")
	if title == "" {
		title = nodeText(firstElement(doc, "title"))
	}
	if title == "" {
		title = nodeText(firstElement(doc, "h1"))
	}
	description := firstMetaContent(doc, "name", "description")
	if description == "" {
		description = firstMetaContent(doc, "property", "og:description")
	}
	contentNode := largestContentNode(doc)
	if contentNode == nil {
		return webArticle{}, errors.New("未识别到网页正文")
	}
	pruneIgnoredNodes(contentNode)
	var markup bytes.Buffer
	if err := html.Render(&markup, contentNode); err != nil {
		return webArticle{}, err
	}
	markdownConverter := converter.NewConverter(converter.WithPlugins(
		base.NewBasePlugin(),
		commonmark.NewCommonmarkPlugin(),
		table.NewTablePlugin(table.WithHeaderPromotion(true)),
	))
	markdown, err := markdownConverter.ConvertString(markup.String(), converter.WithDomain(page.FinalURL.String()))
	if err != nil {
		return webArticle{}, err
	}
	markdown = strings.TrimSpace(markdown)
	if utf8.RuneCountInString(markdown) < 20 {
		return webArticle{}, errors.New("网页正文内容过少")
	}
	title = truncateText(strings.TrimSpace(title), 255)
	if title == "" {
		title = page.FinalURL.Hostname()
	}
	description = truncateText(strings.TrimSpace(description), 1000)
	if description == "" {
		description = "从网页导入：" + page.FinalURL.String()
	}
	return webArticle{Title: title, Description: description, Markdown: markdown}, nil
}

func largestContentNode(doc *html.Node) *html.Node {
	var semanticBest *html.Node
	semanticLength := 0
	var body *html.Node
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.ElementNode {
			tag := strings.ToLower(node.Data)
			if shouldIgnoreWebNode(node) {
				return
			}
			if tag == "body" {
				body = node
			}
			if isWebContentCandidate(node) {
				length := utf8.RuneCountInString(nodeText(node))
				if length > semanticLength {
					semanticBest, semanticLength = node, length
				}
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(doc)
	if semanticBest != nil && semanticLength >= 20 {
		return semanticBest
	}
	return body
}

func pruneIgnoredNodes(root *html.Node) {
	for child := root.FirstChild; child != nil; {
		next := child.NextSibling
		if child.Type == html.ElementNode && shouldIgnoreWebNode(child) {
			root.RemoveChild(child)
			child = next
			continue
		}
		pruneIgnoredNodes(child)
		child = next
	}
}

var ignoredWebRegionTokens = map[string]bool{
	"ad": true, "ads": true, "advert": true, "advertisement": true,
	"aside": true, "banner": true, "breadcrumb": true, "breadcrumbs": true,
	"comment": true, "comments": true, "cookie": true, "dialog": true,
	"footer": true, "header": true, "menu": true, "modal": true,
	"nav": true, "navigation": true, "popup": true, "recommend": true,
	"recommendation": true, "related": true, "share": true, "sharing": true,
	"sidebar": true, "social": true, "subscribe": true, "toolbar": true,
}

var webContentRegionTokens = map[string]bool{
	"article-body": true, "article-content": true, "content-body": true,
	"entry-content": true, "post-body": true, "post-content": true,
}

func shouldIgnoreWebNode(node *html.Node) bool {
	if node == nil || node.Type != html.ElementNode {
		return false
	}
	tag := strings.ToLower(node.Data)
	if tag == "script" || tag == "style" || tag == "noscript" || tag == "svg" || tag == "nav" || tag == "footer" || tag == "header" || tag == "form" || tag == "aside" || tag == "dialog" || tag == "template" {
		return true
	}
	if strings.EqualFold(attribute(node, "aria-hidden"), "true") || hasAttribute(node, "hidden") {
		return true
	}
	role := strings.ToLower(attribute(node, "role"))
	if role == "banner" || role == "complementary" || role == "contentinfo" || role == "dialog" || role == "navigation" {
		return true
	}
	for _, token := range webRegionTokens(node) {
		if ignoredWebRegionTokens[token] {
			return true
		}
	}
	return false
}

func isWebContentCandidate(node *html.Node) bool {
	if node == nil || node.Type != html.ElementNode {
		return false
	}
	tag := strings.ToLower(node.Data)
	if tag == "article" || tag == "main" || strings.EqualFold(attribute(node, "role"), "main") || strings.EqualFold(attribute(node, "itemprop"), "articleBody") {
		return true
	}
	for _, token := range webRegionTokens(node) {
		if webContentRegionTokens[token] {
			return true
		}
	}
	return false
}

func webRegionTokens(node *html.Node) []string {
	raw := strings.ToLower(attribute(node, "id") + " " + attribute(node, "class"))
	compound := strings.FieldsFunc(raw, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsNumber(r) && r != '-'
	})
	tokens := append([]string(nil), compound...)
	for _, token := range compound {
		tokens = append(tokens, strings.FieldsFunc(token, func(r rune) bool { return r == '-' })...)
	}
	return tokens
}

func firstElement(root *html.Node, tag string) *html.Node {
	if root == nil {
		return nil
	}
	if root.Type == html.ElementNode && strings.EqualFold(root.Data, tag) {
		return root
	}
	for child := root.FirstChild; child != nil; child = child.NextSibling {
		if found := firstElement(child, tag); found != nil {
			return found
		}
	}
	return nil
}

func firstMetaContent(root *html.Node, key, value string) string {
	if root == nil {
		return ""
	}
	if root.Type == html.ElementNode && strings.EqualFold(root.Data, "meta") && strings.EqualFold(attribute(root, key), value) {
		return attribute(root, "content")
	}
	for child := root.FirstChild; child != nil; child = child.NextSibling {
		if found := firstMetaContent(child, key, value); found != "" {
			return found
		}
	}
	return ""
}

func attribute(node *html.Node, key string) string {
	for _, attr := range node.Attr {
		if strings.EqualFold(attr.Key, key) {
			return strings.TrimSpace(attr.Val)
		}
	}
	return ""
}

func hasAttribute(node *html.Node, key string) bool {
	for _, attr := range node.Attr {
		if strings.EqualFold(attr.Key, key) {
			return true
		}
	}
	return false
}

func nodeText(node *html.Node) string {
	if node == nil {
		return ""
	}
	if node.Type == html.TextNode {
		return node.Data
	}
	if node.Type == html.ElementNode && shouldIgnoreWebNode(node) {
		return ""
	}
	var result strings.Builder
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		text := strings.TrimSpace(nodeText(child))
		if text != "" {
			if result.Len() > 0 {
				result.WriteByte(' ')
			}
			result.WriteString(text)
		}
	}
	return result.String()
}

func stripHTMLText(markup string) string {
	doc, err := html.Parse(strings.NewReader(markup))
	if err != nil {
		return ""
	}
	return nodeText(doc)
}

func truncateText(value string, maxRunes int) string {
	runes := []rune(value)
	if len(runes) <= maxRunes {
		return value
	}
	return string(runes[:maxRunes])
}
