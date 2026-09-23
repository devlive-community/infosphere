package app

import (
	"net/http"
	"strings"

	"knowforge/server/internal/mdclean"
	"knowforge/server/internal/models"

	"github.com/gin-gonic/gin"
)

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
		cleaned := mdclean.StripPermalinkAnchors(d.Content)
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
