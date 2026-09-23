package app

import (
	"net/http"
	"regexp"
	"strings"

	"knowforge/server/internal/models"

	"github.com/gin-gonic/gin"
)

// 文档站常见的「永久链接」锚点：标题后跟一个仅含图标/符号的链接，或链接标题为 "Permanent link"。
// 采集这类站点时会混入正文，点击会误跳到外部地址，需清理。
var (
	// [任意文字](url "Permanent link") —— 按链接标题匹配
	permalinkTitleRe = regexp.MustCompile(`\[[^\]]*\]\([^)]*"[Pp]ermanent [Ll]ink"\)`)
	// [🔗/¶/§/↩/⚓/†/‡](url) —— 链接文字仅为永久链接图标符号
	permalinkGlyphRe = regexp.MustCompile(`\[\s*[🔗¶§↩⚓†‡]+\s*\]\([^)\s]+(?:\s+"[^"]*")?\)`)
	// 清理后行尾可能残留的空白
	trailingSpaceRe = regexp.MustCompile(`[ \t]+\n`)
)

// stripPermalinkAnchors 从 Markdown 中移除「永久链接」锚点，返回清理后的文本。
func stripPermalinkAnchors(md string) string {
	md = permalinkTitleRe.ReplaceAllString(md, "")
	md = permalinkGlyphRe.ReplaceAllString(md, "")
	md = trailingSpaceRe.ReplaceAllString(md, "\n")
	return md
}

// CleanupBookPermalinks POST /books/:id/cleanup/permalink-anchors
// 扫描本书全部章节，移除采集混入的「永久链接」锚点，返回受影响章节数。
func (a *App) CleanupBookPermalinks(c *gin.Context) {
	book, status := a.findBook(c)
	if book == nil {
		fail(c, status, "书籍不存在")
		return
	}
	if !a.canEditBookContent(currentUser(c), book) {
		fail(c, http.StatusForbidden, "无权操作该书籍")
		return
	}
	var docs []models.Document
	if err := a.DB.Where("book_id = ?", book.ID).Find(&docs).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询失败")
		return
	}
	changed := 0
	for i := range docs {
		d := &docs[i]
		cleaned := stripPermalinkAnchors(d.Content)
		if cleaned != d.Content {
			if err := a.DB.Model(d).Where("id = ?", d.ID).Update("content", cleaned).Error; err == nil {
				changed++
			}
		}
	}
	if changed > 0 {
		a.recordAudit(c, "book.cleanup_permalinks", "book", strings.TrimSpace(book.Slug), book.Title, map[string]any{"changed": changed})
	}
	ok(c, gin.H{"changed": changed})
}
