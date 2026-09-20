package app

import (
	"net/http"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

// recordBookExport 记录一次书籍导出历史（仅登录用户；失败不影响导出主流程）。
// 在各导出 handler 生成文件前调用，format 为 markdown | pdf | docx | epub | zip。
func (a *App) recordBookExport(u *models.User, book *models.Book, format string) {
	if u == nil || book == nil {
		return
	}
	_ = a.DB.Create(&models.BookExportRecord{
		UserID:    u.ID,
		BookID:    book.ID,
		BookTitle: book.Title,
		BookSlug:  book.Slug,
		Format:    format,
	}).Error
}

// MyExports GET /users/me/exports?page=&page_size= 我导出过的书籍历史（按时间倒序）。
func (a *App) MyExports(c *gin.Context) {
	u := currentUser(c)
	if u == nil {
		fail(c, http.StatusUnauthorized, "请先登录")
		return
	}
	page := atoiDefault(c.Query("page"), 1)
	if page < 1 {
		page = 1
	}
	pageSize := atoiDefault(c.Query("page_size"), 12)
	if pageSize < 1 || pageSize > 100 {
		pageSize = 12
	}

	var total int64
	a.DB.Model(&models.BookExportRecord{}).Where("user_id = ?", u.ID).Count(&total)

	records := []models.BookExportRecord{}
	if err := a.DB.Where("user_id = ?", u.ID).
		Order("created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&records).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询失败")
		return
	}

	// 关联当前仍存在的书籍（用于封面/最新标题跳转）；已删除的书仅展示历史快照。
	ids := make([]uint, 0, len(records))
	for _, r := range records {
		ids = append(ids, r.BookID)
	}
	bookByID := map[uint]*models.Book{}
	if len(ids) > 0 {
		books := []models.Book{}
		a.DB.Where("id IN ?", ids).Find(&books)
		for i := range books {
			bookByID[books[i].ID] = &books[i]
		}
	}

	type exportItem struct {
		ID        uint         `json:"id"`
		Format    string       `json:"format"`
		CreatedAt string       `json:"created_at"`
		BookTitle string       `json:"book_title"`
		BookSlug  string       `json:"book_slug"`
		Book      *models.Book `json:"book"` // 仍存在时返回，供封面/跳转；否则为 null
	}
	items := make([]exportItem, 0, len(records))
	for _, r := range records {
		items = append(items, exportItem{
			ID:        r.ID,
			Format:    r.Format,
			CreatedAt: r.CreatedAt.Format("2006-01-02 15:04"),
			BookTitle: r.BookTitle,
			BookSlug:  r.BookSlug,
			Book:      bookByID[r.BookID],
		})
	}

	ok(c, gin.H{"items": items, "total": total, "page": page, "page_size": pageSize})
}
