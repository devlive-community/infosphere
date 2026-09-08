package app

import (
	"net/http"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

// adminBookSorts 后台书籍列表排序白名单，禁止将查询参数直接拼入 SQL。
var adminBookSorts = map[string]string{
	"created_at_desc": "books.created_at DESC",
	"created_at_asc":  "books.created_at ASC",
	"updated_at_desc": "books.updated_at DESC",
	"updated_at_asc":  "books.updated_at ASC",
	"view_count_desc": "books.view_count DESC",
	"view_count_asc":  "books.view_count ASC",
}

// AdminListBooks GET /admin/books 管理员分页查询全站书籍，包含私有、草稿与归档内容。
func (a *App) AdminListBooks(c *gin.Context) {
	page, pageSize := paginate(c)
	query := a.DB.Model(&models.Book{}).
		Joins("LEFT JOIN users AS owner ON owner.id = books.user_id")

	if q := c.Query("q"); q != "" {
		like := "%" + q + "%"
		query = query.Where("books.title LIKE ? OR books.slug LIKE ? OR owner.username LIKE ?", like, like, like)
	}
	if status := c.Query("status"); bookStatuses[status] {
		query = query.Where("books.status = ?", status)
	}
	switch c.Query("visibility") {
	case "public":
		query = query.Where("books.is_public = ?", true)
	case "private":
		query = query.Where("books.is_public = ?", false)
	}

	order := adminBookSorts["created_at_desc"]
	if clause, ok := adminBookSorts[c.Query("sort")]; ok {
		order = clause
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询失败")
		return
	}
	books := []models.Book{}
	if err := preloadBookUser(query).
		Order(order).
		Limit(pageSize).Offset((page - 1) * pageSize).
		Find(&books).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询失败")
		return
	}
	a.attachChapterCounts(books)
	ok(c, PageResult{Items: books, Total: total, Page: page, PageSize: pageSize})
}
