package bookversions

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"infosphere/server/internal/models"
	"infosphere/server/internal/plugincore"
	"infosphere/server/internal/plugins"
)

// bookVariant 分组内的一本书（版本组），供阅读页切换。
type bookVariant struct {
	Slug         string `json:"slug"`
	Title        string `json:"title"`
	Language     string `json:"language"`
	Version      string `json:"version"`
	Current      bool   `json:"current"`
	FirstDocSlug string `json:"first_doc_slug"`
}

// bookGroupSiblings 返回版本组内取相同非空值、且对当前用户可见的书籍（含自身）。
func bookGroupSiblings(core plugincore.Core, u *models.User, book *models.Book, column, value string) []bookVariant {
	if strings.TrimSpace(value) == "" {
		return []bookVariant{}
	}
	var books []models.Book
	core.Gorm().Where(column+" = ?", value).Order("id ASC").Find(&books)
	out := make([]bookVariant, 0, len(books))
	for i := range books {
		b := &books[i]
		if !core.CanReadBook(u, b) {
			continue
		}
		var firstDocSlug string
		core.Gorm().Model(&models.Document{}).Where("book_id = ? AND status = ?", b.ID, "published").
			Order("sort_order ASC, created_at ASC").Limit(1).Pluck("slug", &firstDocSlug)
		out = append(out, bookVariant{Slug: b.Slug, Title: b.Title, Language: b.Language, Version: b.Version, Current: b.ID == book.ID, FirstDocSlug: firstDocSlug})
	}
	if len(out) <= 1 {
		return []bookVariant{}
	}
	return out
}

type behavior struct{ core plugincore.Core }

func init() { plugincore.RegisterBehavior(&behavior{}) }

func (b *behavior) Key() string { return plugins.KeyBookVersions }

func (b *behavior) RegisterRoutes(api *gin.RouterGroup, core plugincore.Core) {
	b.core = core
	api.GET("/books/:id/versions", core.OptionalAuth(), core.RequireFeaturePlugin(plugins.KeyBookVersions), b.GetBookVersions)
}

// GetBookVersions GET /books/:id/versions 同一版本组内、对当前用户可见的书籍（含自身），供阅读页版本切换。
func (b *behavior) GetBookVersions(c *gin.Context) {
	core := b.core
	book, status := core.FindBook(c)
	if book == nil {
		core.Fail(c, status, "书籍不存在")
		return
	}
	u := core.CurrentUser(c)
	if !core.CanReadBook(u, book) {
		core.Fail(c, http.StatusNotFound, "书籍不存在")
		return
	}
	core.OK(c, gin.H{"items": bookGroupSiblings(core, u, book, "version_group", book.VersionGroup)})
}
