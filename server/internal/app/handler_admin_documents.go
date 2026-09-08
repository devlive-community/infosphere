package app

import (
	"net/http"
	"strconv"
	"time"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

var adminDocumentSorts = map[string]string{
	"created_at_desc": "documents.created_at DESC",
	"created_at_asc":  "documents.created_at ASC",
	"updated_at_desc": "documents.updated_at DESC",
	"updated_at_asc":  "documents.updated_at ASC",
	"view_count_desc": "documents.view_count DESC",
	"view_count_asc":  "documents.view_count ASC",
}

type adminDocumentItem struct {
	ID             uint      `json:"id"`
	BookID         uint      `json:"book_id"`
	ParentID       *uint     `json:"parent_id"`
	Title          string    `json:"title"`
	Slug           string    `json:"slug"`
	Status         string    `json:"status"`
	AllowComments  *bool     `json:"allow_comments"`
	SortOrder      int       `json:"sort_order"`
	ViewCount      int       `json:"view_count"`
	BookTitle      string    `json:"book_title"`
	BookSlug       string    `json:"book_slug"`
	ParentTitle    string    `json:"parent_title"`
	AuthorUsername string    `json:"author_username"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// AdminListDocuments GET /admin/documents 管理员分页查询全站章节，不返回正文内容。
func (a *App) AdminListDocuments(c *gin.Context) {
	page, pageSize := paginate(c)
	query := a.DB.Model(&models.Document{}).
		Joins("JOIN books ON books.id = documents.book_id").
		Joins("LEFT JOIN users AS author ON author.id = documents.user_id").
		Joins("LEFT JOIN documents AS parent ON parent.id = documents.parent_id")

	if q := c.Query("q"); q != "" {
		like := "%" + q + "%"
		query = query.Where(
			"documents.title LIKE ? OR documents.slug LIKE ? OR books.title LIKE ? OR author.username LIKE ?",
			like, like, like, like,
		)
	}
	if status := c.Query("status"); docStatuses[status] {
		query = query.Where("documents.status = ?", status)
	}
	if rawBookID := c.Query("book_id"); rawBookID != "" {
		bookID, err := strconv.ParseUint(rawBookID, 10, 64)
		if err != nil || bookID == 0 {
			fail(c, http.StatusBadRequest, "书籍 ID 无效")
			return
		}
		query = query.Where("documents.book_id = ?", bookID)
	}

	order := adminDocumentSorts["updated_at_desc"]
	if clause, ok := adminDocumentSorts[c.Query("sort")]; ok {
		order = clause
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询失败")
		return
	}
	items := []adminDocumentItem{}
	if err := query.Select(
		"documents.id, documents.book_id, documents.parent_id, documents.title, documents.slug, " +
			"documents.status, documents.allow_comments, documents.sort_order, documents.view_count, " +
			"books.title AS book_title, books.slug AS book_slug, " +
			"COALESCE(parent.title, '') AS parent_title, COALESCE(author.username, '') AS author_username, " +
			"documents.created_at, documents.updated_at",
	).
		Order(order).
		Limit(pageSize).Offset((page - 1) * pageSize).
		Scan(&items).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询失败")
		return
	}
	ok(c, PageResult{Items: items, Total: total, Page: page, PageSize: pageSize})
}
