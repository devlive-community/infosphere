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

// CleanupBookInternalLinks POST /books/:id/cleanup/internal-links
// 用本书历史采集记录（CrawlPage）构建「原始URL→章节」映射，把全书正文里指向这些页面的外链改写为站内链接。
func (a *App) CleanupBookInternalLinks(c *gin.Context) {
	book, status := a.findBook(c)
	if book == nil {
		fail(c, status, "书籍不存在")
		return
	}
	if !a.canEditBookContent(currentUser(c), book) {
		fail(c, http.StatusForbidden, "无权操作该书籍")
		return
	}
	// 本书全部采集页面（成功且已生成章节）→ 归一化URL→docID
	var jobIDs []uint
	a.DB.Model(&models.CrawlJob{}).Where("book_id = ?", book.ID).Pluck("id", &jobIDs)
	urlToSlug := map[string]string{}
	if len(jobIDs) > 0 {
		var pages []models.CrawlPage
		a.DB.Where("job_id IN ? AND doc_id <> 0", jobIDs).Find(&pages)
		docIDs := make([]uint, 0, len(pages))
		for i := range pages {
			docIDs = append(docIDs, pages[i].DocID)
		}
		var docs []models.Document
		a.DB.Where("id IN ?", docIDs).Find(&docs)
		slugByID := make(map[uint]string, len(docs))
		for i := range docs {
			slugByID[docs[i].ID] = docs[i].Slug
		}
		for i := range pages {
			if s := slugByID[pages[i].DocID]; s != "" && pages[i].URL != "" {
				urlToSlug[pages[i].URL] = s
			}
		}
	}
	changed := 0
	if len(urlToSlug) > 0 {
		var all []models.Document
		a.DB.Where("book_id = ?", book.ID).Find(&all)
		for i := range all {
			d := &all[i]
			if nc := rewriteInternalLinks(d.Content, urlToSlug, book.Slug); nc != d.Content {
				if a.DB.Model(&models.Document{}).Where("id = ?", d.ID).Update("content", nc).Error == nil {
					changed++
				}
			}
		}
	}
	if changed > 0 {
		a.recordAudit(c, "book.cleanup_internal_links", "book", strings.TrimSpace(book.Slug), book.Title, map[string]any{"changed": changed})
	}
	ok(c, gin.H{"changed": changed})
}
