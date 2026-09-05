package app

import (
	"net/http"
	"strconv"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var bookStatuses = map[string]bool{"draft": true, "published": true, "archived": true}

var allowedOrderCols = map[string]bool{"created_at": true, "updated_at": true, "title": true, "view_count": true}

// canManageBook 判断用户能否管理书籍
func (a *App) canManageBook(u *models.User, b *models.Book) bool {
	return IsAdmin(u) || (u != nil && u.ID == b.UserID)
}

// canReadBook 判断书籍是否对当前用户可见
func (a *App) canReadBook(u *models.User, b *models.Book) bool {
	if b.IsPublic && b.Status == "published" {
		return true
	}
	return a.canManageBook(u, b)
}

func preloadBookUser(db *gorm.DB) *gorm.DB {
	return db.
		Preload("User", func(tx *gorm.DB) *gorm.DB {
			return tx.Select("id", "username", "avatar", "email", "bio", "github_url", "role")
		}).
		Preload("Tags")
}

// ListBooks GET /books
func (a *App) ListBooks(c *gin.Context) {
	page, pageSize := paginate(c)
	u := currentUser(c)
	mine := c.Query("mine") == "true"

	query := a.DB.Model(&models.Book{})
	if mine {
		if u == nil {
			fail(c, http.StatusUnauthorized, "请先登录")
			return
		}
		query = query.Where("user_id = ?", u.ID)
		if s := c.Query("status"); s != "" && bookStatuses[s] {
			query = query.Where("status = ?", s)
		}
	} else {
		query = query.Where("is_public = ? AND status = ?", true, "published")
	}
	if title := c.Query("title"); title != "" {
		query = query.Where("title LIKE ?", "%"+title+"%")
	}
	if username := c.Query("username"); username != "" {
		query = query.Joins("JOIN users u ON u.id = books.user_id").Where("u.username LIKE ?", "%"+username+"%")
	}
	if tagSlug := c.Query("tag"); tagSlug != "" {
		query = query.Joins("JOIN book_tags bt ON bt.book_id = books.id").
			Joins("JOIN tags t ON t.id = bt.tag_id AND t.slug = ?", tagSlug)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询失败")
		return
	}
	var books []models.Book
	if err := preloadBookUser(query).
		Order("books.created_at DESC").
		Limit(pageSize).Offset((page - 1) * pageSize).
		Find(&books).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询失败")
		return
	}
	ok(c, PageResult{Items: books, Total: total, Page: page, PageSize: pageSize})
}

// BookSummary GET /books/summary 当前用户书籍统计
func (a *App) BookSummary(c *gin.Context) {
	u := currentUser(c)
	type row struct {
		Status string
		Count  int64
		Views  int64
	}
	var rows []row
	a.DB.Model(&models.Book{}).
		Select("status, COUNT(*) as count, COALESCE(SUM(view_count), 0) as views").
		Where("user_id = ?", u.ID).
		Group("status").Scan(&rows)

	summary := gin.H{"total_books": 0, "total_views": 0, "published": gin.H{"count": 0, "views": 0}, "draft": gin.H{"count": 0, "views": 0}, "archived": gin.H{"count": 0, "views": 0}}
	for _, r := range rows {
		summary["total_books"] = summary["total_books"].(int64) + r.Count
		summary["total_views"] = summary["total_views"].(int64) + r.Views
		summary[r.Status] = gin.H{"count": r.Count, "views": r.Views}
	}
	ok(c, summary)
}

type bookPayload struct {
	Title         *string `json:"title"`
	Description   *string `json:"description"`
	CoverImage    *string `json:"cover_image"`
	Slug          *string `json:"slug"`
	Status        *string `json:"status"`
	IsPublic      *bool   `json:"is_public"`
	OrderCol      *string `json:"order_col"`
	OrderDir      *string `json:"order_dir"`
	ChapterPrefix *string `json:"chapter_prefix"`
	Tags          []string `json:"tags"`
}

// CreateBook POST /books
func (a *App) CreateBook(c *gin.Context) {
	var req bookPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if req.Title == nil || *req.Title == "" {
		fail(c, http.StatusBadRequest, "请填写书籍标题")
		return
	}
	if req.Status != nil && !bookStatuses[*req.Status] {
		fail(c, http.StatusBadRequest, "无效的状态")
		return
	}
	u := currentUser(c)

	slug := ""
	if req.Slug != nil && *req.Slug != "" {
		if !validSlug(*req.Slug) {
			fail(c, http.StatusBadRequest, "slug 仅支持小写字母、数字和中划线")
			return
		}
		slug = *req.Slug
	} else {
		slug = slugify(*req.Title)
	}

	book := models.Book{
		Title:     *req.Title,
		UserID:    u.ID,
		Status:    "draft",
		OrderCol:  "created_at",
		OrderDir:  "desc",
		IsPublic:  req.IsPublic != nil && *req.IsPublic,
	}
	if req.Description != nil {
		book.Description = *req.Description
	}
	if req.CoverImage != nil {
		book.CoverImage = *req.CoverImage
	}
	if req.Status != nil {
		book.Status = *req.Status
	}
	if req.OrderCol != nil && allowedOrderCols[*req.OrderCol] {
		book.OrderCol = *req.OrderCol
	}
	if req.OrderDir != nil && (*req.OrderDir == "asc" || *req.OrderDir == "desc") {
		book.OrderDir = *req.OrderDir
	}
	if req.ChapterPrefix != nil {
		book.ChapterPrefix = *req.ChapterPrefix
	}

	for i := 0; i < 50; i++ {
		candidate := slug
		if candidate == "" {
			candidate = randomSlug("book")
		} else if i > 0 {
			candidate = slug + "-" + strconv.Itoa(i+1)
		}
		var count int64
		a.DB.Model(&models.Book{}).Where("slug = ?", candidate).Count(&count)
		if count == 0 {
			book.Slug = candidate
			break
		}
		if slug == "" {
			slug = "" // 随机 slug 冲突时下一轮重新生成
		}
	}
	if book.Slug == "" {
		fail(c, http.StatusConflict, "slug 生成失败，请手动指定")
		return
	}

	if err := a.DB.Create(&book).Error; err != nil {
		fail(c, http.StatusInternalServerError, "创建失败: "+err.Error())
		return
	}
	if len(req.Tags) > 0 {
		if err := a.syncBookTags(&book, req.Tags); err != nil {
			fail(c, http.StatusInternalServerError, "标签关联失败: "+err.Error())
			return
		}
	}
	ok(c, book)
}

// GetBook GET /books/:id
func (a *App) GetBook(c *gin.Context) {
	book, status := a.findBook(c)
	if book == nil {
		fail(c, status, "书籍不存在")
		return
	}
	if !a.canReadBook(currentUser(c), book) {
		fail(c, http.StatusForbidden, "无权访问该书籍")
		return
	}
	ok(c, book)
}

// GetBookBySlug GET /books/slug/:slug
func (a *App) GetBookBySlug(c *gin.Context) {
	var book models.Book
	if err := preloadBookUser(a.DB).Where("slug = ?", c.Param("slug")).First(&book).Error; err != nil {
		fail(c, http.StatusNotFound, "书籍不存在")
		return
	}
	if !a.canReadBook(currentUser(c), &book) {
		fail(c, http.StatusForbidden, "无权访问该书籍")
		return
	}
	ok(c, book)
}

// UpdateBook PUT /books/:id
func (a *App) UpdateBook(c *gin.Context) {
	book, status := a.findBook(c)
	if book == nil {
		fail(c, status, "书籍不存在")
		return
	}
	if !a.canManageBook(currentUser(c), book) {
		fail(c, http.StatusForbidden, "无权操作该书籍")
		return
	}

	var req bookPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if req.Title != nil && *req.Title != "" {
		book.Title = *req.Title
	}
	if req.Description != nil {
		book.Description = *req.Description
	}
	if req.CoverImage != nil {
		book.CoverImage = *req.CoverImage
	}
	if req.Status != nil && bookStatuses[*req.Status] {
		book.Status = *req.Status
	}
	if req.IsPublic != nil {
		book.IsPublic = *req.IsPublic
	}
	if req.OrderCol != nil && allowedOrderCols[*req.OrderCol] {
		book.OrderCol = *req.OrderCol
	}
	if req.OrderDir != nil && (*req.OrderDir == "asc" || *req.OrderDir == "desc") {
		book.OrderDir = *req.OrderDir
	}
	if req.ChapterPrefix != nil {
		book.ChapterPrefix = *req.ChapterPrefix
	}
	if req.Slug != nil && *req.Slug != book.Slug {
		if !validSlug(*req.Slug) {
			fail(c, http.StatusBadRequest, "slug 仅支持小写字母、数字和中划线")
			return
		}
		var count int64
		a.DB.Model(&models.Book{}).Where("slug = ? AND id != ?", *req.Slug, book.ID).Count(&count)
		if count > 0 {
			fail(c, http.StatusConflict, "slug 已被占用")
			return
		}
		book.Slug = *req.Slug
	}

	if err := a.DB.Save(book).Error; err != nil {
		fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
		return
	}
	if req.Tags != nil {
		if err := a.syncBookTags(book, req.Tags); err != nil {
			fail(c, http.StatusInternalServerError, "标签关联失败: "+err.Error())
			return
		}
	}
	ok(c, book)
}

// DeleteBook DELETE /books/:id
func (a *App) DeleteBook(c *gin.Context) {
	book, status := a.findBook(c)
	if book == nil {
		fail(c, status, "书籍不存在")
		return
	}
	if !a.canManageBook(currentUser(c), book) {
		fail(c, http.StatusForbidden, "无权操作该书籍")
		return
	}
	if err := a.DB.Where("book_id = ?", book.ID).Delete(&models.Document{}).Error; err != nil {
		fail(c, http.StatusInternalServerError, "删除文档失败: "+err.Error())
		return
	}
	if err := a.DB.Delete(book).Error; err != nil {
		fail(c, http.StatusInternalServerError, "删除失败: "+err.Error())
		return
	}
	ok(c, gin.H{"message": "已删除"})
}

// IncrementBookView POST /books/:id/view
func (a *App) IncrementBookView(c *gin.Context) {
	book, status := a.findBook(c)
	if book == nil {
		fail(c, status, "书籍不存在")
		return
	}
	a.DB.Model(book).UpdateColumn("view_count", book.ViewCount+1)
	ok(c, gin.H{"view_count": book.ViewCount + 1})
}

// findBook 按路径参数 :id 查找书籍
func (a *App) findBook(c *gin.Context) (*models.Book, int) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return nil, http.StatusBadRequest
	}
	var book models.Book
	if err := preloadBookUser(a.DB).First(&book, id).Error; err != nil {
		return nil, http.StatusNotFound
	}
	return &book, http.StatusOK
}
