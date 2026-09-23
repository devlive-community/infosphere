package bookversions

import (
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"knowforge/server/internal/models"
	"knowforge/server/internal/plugincore"
	"knowforge/server/internal/plugins"
)

// bookVariant 分组内的一本书（版本组），供阅读页切换。
type bookVariant struct {
	Slug         string `json:"slug"`
	Title        string `json:"title"`
	Language     string `json:"language"`
	Version      string `json:"version"`
	Current      bool   `json:"current"`
	IsLatest     bool   `json:"is_latest"`
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
		out = append(out, bookVariant{Slug: b.Slug, Title: b.Title, Language: b.Language, Version: b.Version, Current: b.ID == book.ID, IsLatest: b.VersionIsLatest, FirstDocSlug: firstDocSlug})
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
	api.GET("/books/:id/versions/books", core.OptionalAuth(), core.RequireFeaturePlugin(plugins.KeyBookVersions), b.ListBookVersionBooks)
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

var versionNumberRe = regexp.MustCompile(`\d+`)

// compareVersions 按版本号中的数字逐段比较（v1.10 > v1.9），数字相同再按字符串比较；与前端 cmpVersion 一致。
func compareVersions(a, b string) int {
	pa, pb := versionNumberRe.FindAllString(a, -1), versionNumberRe.FindAllString(b, -1)
	for i := 0; i < len(pa) || i < len(pb); i++ {
		var na, nb int
		if i < len(pa) {
			na, _ = strconv.Atoi(pa[i])
		}
		if i < len(pb) {
			nb, _ = strconv.Atoi(pb[i])
		}
		if na != nb {
			if na < nb {
				return -1
			}
			return 1
		}
	}
	return strings.Compare(a, b)
}

// ListBookVersionBooks GET /books/:id/versions/books?page=&page_size=
// 版本组内对当前用户可见的全部书籍（含自身，完整书籍卡片数据），按站点「版本排序」配置排序后分页；供列表「N 个版本」弹框使用。
func (b *behavior) ListBookVersionBooks(c *gin.Context) {
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
	page, pageSize := core.Paginate(c)
	books := []models.Book{}
	if strings.TrimSpace(book.VersionGroup) == "" {
		books = append(books, *book)
	} else {
		var all []models.Book
		if err := core.PreloadBookUser().Where("version_group = ?", book.VersionGroup).Find(&all).Error; err != nil {
			core.Fail(c, http.StatusInternalServerError, "查询失败")
			return
		}
		for i := range all {
			if core.CanReadBook(u, &all[i]) {
				books = append(books, all[i])
			}
		}
	}
	asc := core.GetSetting("book_versions_sort") == "asc"
	sort.SliceStable(books, func(i, j int) bool {
		d := compareVersions(books[i].Version, books[j].Version)
		if d == 0 {
			return books[i].ID > books[j].ID
		}
		if asc {
			return d < 0
		}
		return d > 0
	})
	total := len(books)
	start := (page - 1) * pageSize
	if start > total {
		start = total
	}
	end := start + pageSize
	if end > total {
		end = total
	}
	items := books[start:end]
	core.AttachChapterCounts(items)
	core.AttachBookTags(items)
	core.OK(c, plugincore.PageResult{Items: items, Total: int64(total), Page: page, PageSize: pageSize})
}
