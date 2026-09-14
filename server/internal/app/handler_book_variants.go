package app

import (
	"net/http"
	"strings"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

// bookVariant 分组内的一本书（翻译组/版本组共用），供阅读页切换。
type bookVariant struct {
	Slug         string `json:"slug"`
	Title        string `json:"title"`
	Language     string `json:"language"`
	Version      string `json:"version"`
	Current      bool   `json:"current"`
	FirstDocSlug string `json:"first_doc_slug"` // 首个可读章节 slug，供阅读页直接跳转（无则为空）
}

// bookGroupSiblings 返回某分组列（trans_group / version_group）取相同非空值、且对当前用户可见的书籍（含自身）。
func (a *App) bookGroupSiblings(u *models.User, book *models.Book, column, value string) []bookVariant {
	if strings.TrimSpace(value) == "" {
		return []bookVariant{}
	}
	var books []models.Book
	a.DB.Where(column+" = ?", value).Order("id ASC").Find(&books)
	out := make([]bookVariant, 0, len(books))
	for i := range books {
		b := &books[i]
		if !a.canReadBook(u, b) {
			continue
		}
		var firstDocSlug string
		a.DB.Model(&models.Document{}).Where("book_id = ? AND status = ?", b.ID, "published").
			Order("sort_order ASC, created_at ASC").Limit(1).Pluck("slug", &firstDocSlug)
		out = append(out, bookVariant{Slug: b.Slug, Title: b.Title, Language: b.Language, Version: b.Version, Current: b.ID == book.ID, FirstDocSlug: firstDocSlug})
	}
	// 单独一本（只有自身）时不构成分组，返回空
	if len(out) <= 1 {
		return []bookVariant{}
	}
	return out
}

// GetBookTranslations GET /books/:id/translations 同一翻译组内、对当前用户可见的书籍（含自身），供阅读页语言切换。
func (a *App) GetBookTranslations(c *gin.Context) {
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
	ok(c, gin.H{"items": a.bookGroupSiblings(u, book, "trans_group", book.TransGroup)})
}

// GetBookVersions GET /books/:id/versions 同一版本组内、对当前用户可见的书籍（含自身），供阅读页版本切换。
func (a *App) GetBookVersions(c *gin.Context) {
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
	ok(c, gin.H{"items": a.bookGroupSiblings(u, book, "version_group", book.VersionGroup)})
}
