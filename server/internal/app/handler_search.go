package app

import (
	"net/http"
	"time"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

type searchResult struct {
	Books     []models.Book     `json:"books"`
	Documents []searchDocResult `json:"documents"`
	Total     int64             `json:"total"`
}

type searchDocResult struct {
	ID        uint      `json:"id"`
	BookID    uint      `json:"book_id"`
	BookSlug  string    `json:"book_slug"`
	DocSlug   string    `json:"doc_slug"`
	Title     string    `json:"title"`
	Excerpt   string    `json:"excerpt"`
	UpdatedAt time.Time `json:"updated_at"`
}

// GlobalSearch GET /search?q= 全文搜索（标题与内容，LIKE 实现，跨数据库方言）
func (a *App) GlobalSearch(c *gin.Context) {
	q := c.Query("q")
	if len([]rune(q)) < 1 {
		ok(c, searchResult{Books: []models.Book{}, Documents: []searchDocResult{}})
		return
	}
	like := "%" + q + "%"

	// 书籍：公开且处于可阅读状态，或本人/管理员/协作者可见。
	books := []models.Book{}
	bookQuery := a.DB.Where("(title LIKE ? OR description LIKE ?)", like, like)
	if u := currentUser(c); u != nil {
		if !IsAdmin(u) {
			bookQuery = bookQuery.Where(
				"(is_public = ? AND status IN ?) OR user_id = ? OR EXISTS (SELECT 1 FROM book_collaborators bc WHERE bc.book_id = books.id AND bc.user_id = ? AND bc.status = 'accepted')",
				true, publiclyReadableBookStatuses, u.ID, u.ID,
			)
		}
	} else {
		bookQuery = bookQuery.Where("is_public = ? AND status IN ?", true, publiclyReadableBookStatuses)
	}
	if err := bookQuery.Limit(10).Find(&books).Error; err != nil {
		fail(c, http.StatusInternalServerError, "搜索失败")
		return
	}

	// 章节：书籍可公开阅读且章节已发布，或 owner/admin/editor 可看草稿；viewer 仅看已发布章节。
	docs := []models.Document{}
	docQuery := a.DB.Model(&models.Document{}).
		Joins("JOIN books b ON b.id = documents.book_id").
		Where("(documents.title LIKE ? OR documents.content LIKE ?)", like, like)
	if u := currentUser(c); u != nil {
		if !IsAdmin(u) {
			docQuery = docQuery.Where(`
				(b.is_public = ? AND b.status IN ? AND documents.status = ?)
				OR b.user_id = ?
				OR EXISTS (SELECT 1 FROM book_collaborators bc WHERE bc.book_id = b.id AND bc.user_id = ? AND bc.role = 'editor' AND bc.status = 'accepted')
				OR (documents.status = ? AND EXISTS (SELECT 1 FROM book_collaborators bc WHERE bc.book_id = b.id AND bc.user_id = ? AND bc.role = 'viewer' AND bc.status = 'accepted'))`,
				true, publiclyReadableBookStatuses, "published", u.ID, u.ID, "published", u.ID,
			)
		}
	} else {
		docQuery = docQuery.Where("b.is_public = ? AND b.status IN ? AND documents.status = ?", true, publiclyReadableBookStatuses, "published")
	}
	if err := docQuery.Select("documents.*").Limit(10).Find(&docs).Error; err != nil {
		fail(c, http.StatusInternalServerError, "搜索失败")
		return
	}

	// 章节带 book slug 方便跳转：一次性收集书籍 slug，避免逐条反查
	bookIDs := make([]uint, 0, len(docs))
	for _, d := range docs {
		bookIDs = append(bookIDs, d.BookID)
	}
	bookSlugByID := map[uint]string{}
	if len(bookIDs) > 0 {
		var slugRows []models.Book
		a.DB.Select("id, slug").Where("id IN ?", bookIDs).Find(&slugRows)
		for _, b := range slugRows {
			bookSlugByID[b.ID] = b.Slug
		}
	}

	results := make([]searchDocResult, 0, len(docs))
	for _, d := range docs {
		excerpt := d.Content
		if len([]rune(excerpt)) > 120 {
			excerpt = string([]rune(excerpt)[:120]) + "…"
		}
		results = append(results, searchDocResult{
			ID: d.ID, BookID: d.BookID, BookSlug: bookSlugByID[d.BookID], DocSlug: d.Slug,
			Title: d.Title, Excerpt: excerpt, UpdatedAt: d.UpdatedAt,
		})
	}

	ok(c, searchResult{Books: books, Documents: results, Total: int64(len(books) + len(docs))})
}
