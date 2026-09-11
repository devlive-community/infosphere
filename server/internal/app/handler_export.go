package app

import (
	"net/http"
	"strings"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

// allExportFormats 目前支持的全部导出格式
var allExportFormats = []string{"pdf", "epub", "markdown"}

func isKnownFormat(f string) bool {
	for _, x := range allExportFormats {
		if x == f {
			return true
		}
	}
	return false
}

// bookAllowedFormats 书籍允许导出的格式；ExportFormats 为空表示全部
func bookAllowedFormats(book *models.Book) []string {
	if strings.TrimSpace(book.ExportFormats) == "" {
		return allExportFormats
	}
	out := []string{}
	for _, f := range strings.Split(book.ExportFormats, ",") {
		f = strings.TrimSpace(f)
		if isKnownFormat(f) {
			out = append(out, f)
		}
	}
	if len(out) == 0 {
		return allExportFormats
	}
	return out
}

// normalizeExportFormats 规整前端传入的允许格式列表：仅保留已知格式，去重；
// 空或全选都归一化为空字符串（表示全部可用）。
func normalizeExportFormats(raw string) string {
	seen := map[string]bool{}
	out := []string{}
	for _, f := range strings.Split(raw, ",") {
		f = strings.ToLower(strings.TrimSpace(f))
		if isKnownFormat(f) && !seen[f] {
			seen[f] = true
			out = append(out, f)
		}
	}
	if len(out) == 0 || len(out) == len(allExportFormats) {
		return ""
	}
	return strings.Join(out, ",")
}

func formatAllowed(book *models.Book, format string) bool {
	for _, f := range bookAllowedFormats(book) {
		if f == format {
			return true
		}
	}
	return false
}

// canExportBook 导出鉴权：作者/协作者/管理员始终可导；否则要求书籍可公开阅读且作者开启导出
func (a *App) canExportBook(u *models.User, book *models.Book) bool {
	if a.canEditBookContent(u, book) {
		return true
	}
	if !(book.IsPublic && isPubliclyReadableBookStatus(book.Status) && book.ExportEnabled) {
		return false
	}
	// 未登录游客还需作者额外开启游客导出
	if u == nil {
		return book.GuestExportEnabled
	}
	return true
}

// PDFExportAvailable GET /export/pdf-available 是否已安装 PDF 导出插件（供前端联动禁用相关设置）
func (a *App) PDFExportAvailable(c *gin.Context) {
	ok(c, gin.H{"available": a.installedChromePath() != ""})
}

// GetExportOptions GET /books/:id/export/options 返回当前用户对该书的导出能力，供前端渲染导出入口
func (a *App) GetExportOptions(c *gin.Context) {
	book, status := a.findBook(c)
	if book == nil {
		fail(c, status, "书籍不存在")
		return
	}
	u := currentUser(c)
	if !a.canReadBook(u, book) {
		fail(c, http.StatusNotFound, "书籍不存在")
		return
	}
	ok(c, gin.H{
		"can_export":    a.canExportBook(u, book),
		"formats":       bookAllowedFormats(book),
		"style_shared":  book.ExportStyleShared,
		"pdf_available": a.installedChromePath() != "",
	})
}

// ExportBookMarkdownPublic GET /books/:id/export/markdown 导出 markdown zip（受导出鉴权保护，游客可导开放书籍）
func (a *App) ExportBookMarkdownPublic(c *gin.Context) {
	book, status := a.findBook(c)
	if book == nil {
		fail(c, status, "书籍不存在")
		return
	}
	u := currentUser(c)
	if !a.canExportBook(u, book) {
		fail(c, http.StatusForbidden, "该书籍未开放导出")
		return
	}
	if !formatAllowed(book, "markdown") {
		fail(c, http.StatusForbidden, "作者未开放 Markdown 导出")
		return
	}
	a.writeBookMarkdownZip(c, book)
}
