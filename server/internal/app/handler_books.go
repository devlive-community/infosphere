package app

import (
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var bookStatuses = map[string]bool{
	"draft": true, "in_progress": true, "published": true, "completed": true, "archived": true,
}

// publiclyReadableBookStatuses 是可对外提供阅读的书籍状态。
// 草稿尚未发布，归档已从公开区域下线；进行中、已发布、已完成均可公开访问。
var publiclyReadableBookStatuses = []string{"in_progress", "published", "completed"}

func isPubliclyReadableBookStatus(status string) bool {
	return status == "in_progress" || status == "published" || status == "completed"
}

var allowedOrderCols = map[string]bool{"created_at": true, "updated_at": true, "title": true, "view_count": true}

// bookSortOrders 列表排序白名单：前端 sort 值 → ORDER BY 子句（限定 books 表列，兼容联表查询）
var bookSortOrders = map[string]string{
	"updated": "books.updated_at DESC",
	"created": "books.created_at DESC",
	"views":   "books.view_count DESC",
	"title":   "books.title ASC",
}

// bookOrder 返回排序子句，未知或为空时按更新时间倒序
func bookOrder(sort string) string {
	if clause, ok := bookSortOrders[sort]; ok {
		return clause
	}
	return "books.updated_at DESC"
}

// attachChapterCounts 一次分组查询回填各书籍的章节（文档）数量，避免 N+1
func (a *App) attachChapterCounts(books []models.Book) {
	if len(books) == 0 {
		return
	}
	ids := make([]uint, len(books))
	for i := range books {
		ids[i] = books[i].ID
	}
	type countRow struct {
		BookID uint
		Cnt    int
	}
	var rows []countRow
	a.DB.Model(&models.Document{}).
		Select("book_id, COUNT(*) as cnt").
		Where("book_id IN ?", ids).
		Group("book_id").Scan(&rows)
	counts := make(map[uint]int, len(rows))
	for _, r := range rows {
		counts[r.BookID] = r.Cnt
	}
	for i := range books {
		books[i].ChapterCount = counts[books[i].ID]
	}
}

// canManageBook 判断用户能否管理书籍（设置与删除：owner/admin）
func (a *App) canManageBook(u *models.User, b *models.Book) bool {
	return IsAdmin(u) || (u != nil && u.ID == b.UserID)
}

// collaboratorRole 查询用户在书籍上的协作者角色；非协作者返回 ("", false)
func (a *App) collaboratorRole(u *models.User, bookID uint) (string, bool) {
	if u == nil {
		return "", false
	}
	var c models.BookCollaborator
	if err := a.DB.Where("book_id = ? AND user_id = ? AND status = ?", bookID, u.ID, "accepted").First(&c).Error; err != nil {
		return "", false
	}
	return c.Role, true
}

// canEditBookContent 内容归属校验：owner/admin 或 editor 协作者。
// 仅覆盖章节内容与目录管理，书籍设置与删除仍限 canManageBook。
func (a *App) canEditBookContent(u *models.User, b *models.Book) bool {
	if a.canManageBook(u, b) {
		return true
	}
	role, ok := a.collaboratorRole(u, b.ID)
	return ok && role == "editor"
}

// canReadBook 判断书籍是否对当前用户可见
func (a *App) canReadBook(u *models.User, b *models.Book) bool {
	if b.IsPublic && isPubliclyReadableBookStatus(b.Status) {
		return true
	}
	if a.canManageBook(u, b) {
		return true
	}
	// 协作者（editor/viewer）可访问私有协作书籍
	_, ok := a.collaboratorRole(u, b.ID)
	return ok
}

func preloadBookUser(db *gorm.DB) *gorm.DB {
	return db.
		Preload("User", func(tx *gorm.DB) *gorm.DB {
			// 公开书籍响应只能携带公开资料，禁止通过嵌套 User 泄露邮箱、登录时间和账户状态。
			return tx.Select("id", "username", "avatar", "bio", "github_url", "role", "created_at")
		}).
		Preload("Tags")
}

type bookAccess struct {
	CanRead          bool   `json:"can_read"`
	CanManage        bool   `json:"can_manage"`
	CanEditContent   bool   `json:"can_edit_content"`
	CanExport        bool   `json:"can_export"`
	CollaboratorRole string `json:"collaborator_role,omitempty"`
}

// GetBookAccess GET /books/slug/:slug/access 返回由服务端计算的对象级能力，供受保护页面守卫使用。
func (a *App) GetBookAccess(c *gin.Context) {
	var book models.Book
	if err := a.DB.Where("slug = ?", c.Param("slug")).First(&book).Error; err != nil {
		fail(c, http.StatusNotFound, "书籍不存在")
		return
	}
	u := currentUser(c)
	if !a.canReadBook(u, &book) {
		fail(c, http.StatusNotFound, "书籍不存在")
		return
	}
	role, _ := a.collaboratorRole(u, book.ID)
	canManage := a.canManageBook(u, &book)
	canEdit := a.canEditBookContent(u, &book)
	ok(c, bookAccess{
		CanRead:          true,
		CanManage:        canManage,
		CanEditContent:   canEdit,
		CanExport:        canEdit,
		CollaboratorRole: role,
	})
}

// ListBooks GET /books
func (a *App) ListBooks(c *gin.Context) {
	page, pageSize := paginate(c)
	u := currentUser(c)
	mine := c.Query("mine") == "true"
	scope := c.Query("scope")

	query := a.DB.Model(&models.Book{})
	if mine || scope == "owned" || scope == "collaborating" {
		if u == nil {
			fail(c, http.StatusUnauthorized, "请先登录")
			return
		}
		if scope == "collaborating" {
			query = query.Joins("JOIN book_collaborators bc ON bc.book_id = books.id").
				Where("bc.user_id = ? AND bc.status = ?", u.ID, "accepted")
		} else {
			query = query.Where("books.user_id = ?", u.ID)
		}
		if s := c.Query("status"); s != "" && bookStatuses[s] {
			query = query.Where("books.status = ?", s)
		}
	} else {
		query = query.Where("is_public = ? AND status IN ?", true, publiclyReadableBookStatuses)
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
	books := []models.Book{}
	if err := preloadBookUser(query).
		Order(bookOrder(c.Query("sort"))).
		Limit(pageSize).Offset((page - 1) * pageSize).
		Find(&books).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询失败")
		return
	}
	a.attachChapterCounts(books)
	if scope == "collaborating" {
		for i := range books {
			books[i].CollaboratorRole, _ = a.collaboratorRole(u, books[i].ID)
		}
	}
	ok(c, PageResult{Items: books, Total: total, Page: page, PageSize: pageSize})
}

type bookPayload struct {
	Title             *string  `json:"title"`
	Description       *string  `json:"description"`
	CoverImage        *string  `json:"cover_image"`
	Slug              *string  `json:"slug"`
	Status            *string  `json:"status"`
	IsPublic          *bool    `json:"is_public"`
	OrderCol          *string  `json:"order_col"`
	OrderDir          *string  `json:"order_dir"`
	ChapterPrefix     *string  `json:"chapter_prefix"`
	WatermarkEnabled  *bool    `json:"watermark_enabled"`
	WatermarkText     *string  `json:"watermark_text"`
	ExportEnabled     *bool    `json:"export_enabled"`
	ExportStyleShared *bool    `json:"export_style_shared"`
	ExportFormats     *string  `json:"export_formats"`
	Tags              []string `json:"tags"`
}

const maxWatermarkLength = 80

func normalizeWatermark(text string) (string, bool) {
	trimmed := strings.TrimSpace(text)
	return trimmed, utf8.RuneCountInString(trimmed) <= maxWatermarkLength
}

// MyBookCounts GET /books/status-counts 当前用户各状态书籍数量
func (a *App) MyBookCounts(c *gin.Context) {
	u := currentUser(c)
	type row struct {
		Status string
		Count  int64
	}
	var rows []row
	query := a.DB.Model(&models.Book{})
	if c.Query("scope") == "collaborating" {
		query = query.Joins("JOIN book_collaborators bc ON bc.book_id = books.id").
			Where("bc.user_id = ? AND bc.status = ?", u.ID, "accepted")
	} else {
		query = query.Where("books.user_id = ?", u.ID)
	}
	query.Select("books.status, COUNT(*) as count").Group("books.status").Scan(&rows)

	counts := gin.H{"": 0, "draft": 0, "in_progress": 0, "published": 0, "completed": 0, "archived": 0}
	total := int64(0)
	for _, r := range rows {
		counts[r.Status] = r.Count
		total += r.Count
	}
	counts[""] = total
	ok(c, counts)
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
		Title:    *req.Title,
		UserID:   u.ID,
		Status:   "draft",
		OrderCol: "created_at",
		OrderDir: "desc",
		IsPublic: req.IsPublic != nil && *req.IsPublic,
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
	if req.WatermarkText != nil {
		watermarkText, valid := normalizeWatermark(*req.WatermarkText)
		if !valid {
			fail(c, http.StatusBadRequest, "水印内容不能超过 80 个字符")
			return
		}
		book.WatermarkText = watermarkText
	}
	if req.WatermarkEnabled != nil {
		book.WatermarkEnabled = *req.WatermarkEnabled
	}
	if book.WatermarkEnabled && book.WatermarkText == "" {
		fail(c, http.StatusBadRequest, "开启水印后请填写水印内容")
		return
	}
	if req.ExportEnabled != nil {
		book.ExportEnabled = *req.ExportEnabled
	}
	if req.ExportStyleShared != nil {
		book.ExportStyleShared = *req.ExportStyleShared
	}
	if req.ExportFormats != nil {
		book.ExportFormats = normalizeExportFormats(*req.ExportFormats)
	}

	for i := 0; i < 50; i++ {
		candidate := slug
		if candidate == "" {
			candidate = randomSlug("book")
		} else if i > 0 {
			candidate = slug + "-" + strconv.Itoa(i+1)
		}
		var count int64
		a.DB.Unscoped().Model(&models.Book{}).Where("slug = ?", candidate).Count(&count)
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
	u := currentUser(c)
	if !a.canManageBook(u, book) {
		fail(c, http.StatusForbidden, "无权操作该书籍")
		return
	}
	oldStatus, oldPublic := book.Status, book.IsPublic

	var req bookPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if req.Status != nil && !bookStatuses[*req.Status] {
		fail(c, http.StatusBadRequest, "无效的状态")
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
	if req.Status != nil {
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
	if req.WatermarkText != nil {
		watermarkText, valid := normalizeWatermark(*req.WatermarkText)
		if !valid {
			fail(c, http.StatusBadRequest, "水印内容不能超过 80 个字符")
			return
		}
		book.WatermarkText = watermarkText
	}
	if req.WatermarkEnabled != nil {
		book.WatermarkEnabled = *req.WatermarkEnabled
	}
	if book.WatermarkEnabled && book.WatermarkText == "" {
		fail(c, http.StatusBadRequest, "开启水印后请填写水印内容")
		return
	}
	if req.ExportEnabled != nil {
		book.ExportEnabled = *req.ExportEnabled
	}
	if req.ExportStyleShared != nil {
		book.ExportStyleShared = *req.ExportStyleShared
	}
	if req.ExportFormats != nil {
		book.ExportFormats = normalizeExportFormats(*req.ExportFormats)
	}
	if req.Slug != nil && *req.Slug != book.Slug {
		if !validSlug(*req.Slug) {
			fail(c, http.StatusBadRequest, "slug 仅支持小写字母、数字和中划线")
			return
		}
		var count int64
		a.DB.Unscoped().Model(&models.Book{}).Where("slug = ? AND id != ?", *req.Slug, book.ID).Count(&count)
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
	if IsAdmin(u) && (oldStatus != book.Status || oldPublic != book.IsPublic) {
		a.recordAudit(c, "book.moderated", "book", auditID(book.ID), book.Title, map[string]any{
			"status":    map[string]any{"from": oldStatus, "to": book.Status},
			"is_public": map[string]any{"from": oldPublic, "to": book.IsPublic},
			"owner_id":  book.UserID,
		})
	}
	ok(c, book)
}

// DeleteBook DELETE /books/:id 将书籍及当前可见章节移入回收站。
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
	now := currentTime()
	group := randomSlug("trash")
	u := currentUser(c)
	if err := a.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.Document{}).Where("book_id = ?", book.ID).Updates(map[string]any{
			"deleted_at": now, "deleted_by": u.ID, "trash_group": group,
		}).Error; err != nil {
			return err
		}
		return tx.Model(book).Updates(map[string]any{
			"deleted_at": now, "deleted_by": u.ID, "trash_group": group,
		}).Error
	}); err != nil {
		fail(c, http.StatusInternalServerError, "删除失败: "+err.Error())
		return
	}
	ok(c, gin.H{"message": "已移入回收站", "expires_at": now.Add(trashRetention)})
}

// IncrementBookView POST /books/:id/view
func (a *App) IncrementBookView(c *gin.Context) {
	book, status := a.findBook(c)
	if book == nil {
		fail(c, status, "书籍不存在")
		return
	}
	if !a.canReadBook(currentUser(c), book) {
		fail(c, http.StatusNotFound, "书籍不存在")
		return
	}
	source := classifyAnalyticsSource(analyticsReferrer(c), c.Request.Host)
	if err := a.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.Book{}).
			Where("id = ?", book.ID).
			UpdateColumn("view_count", gorm.Expr("view_count + 1")).Error; err != nil {
			return err
		}
		return recordAnalyticsView(tx, book.ID, 0, source)
	}); err != nil {
		fail(c, http.StatusInternalServerError, "更新浏览量失败")
		return
	}
	var viewCount int
	if err := a.DB.Model(&models.Book{}).
		Where("id = ?", book.ID).
		Pluck("view_count", &viewCount).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询浏览量失败")
		return
	}
	ok(c, gin.H{"view_count": viewCount})
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
