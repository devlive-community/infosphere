package app

import (
	"net/http"
	"strings"
	"time"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const trashRetention = 30 * 24 * time.Hour

type trashItem struct {
	Type            string    `json:"type"`
	ID              uint      `json:"id"`
	Title           string    `json:"title"`
	Slug            string    `json:"slug"`
	BookID          uint      `json:"book_id,omitempty"`
	BookTitle       string    `json:"book_title,omitempty"`
	BookSlug        string    `json:"book_slug,omitempty"`
	OwnerUsername   string    `json:"owner_username,omitempty"`
	DescendantCount int64     `json:"descendant_count"`
	DeletedAt       time.Time `json:"deleted_at"`
	ExpiresAt       time.Time `json:"expires_at"`
}

// ListTrash GET /trash?type=book|document 返回当前用户的回收站；管理员可查看全站回收站。
func (a *App) ListTrash(c *gin.Context) {
	kind := strings.ToLower(strings.TrimSpace(c.DefaultQuery("type", "book")))
	if kind != "book" && kind != "document" {
		fail(c, http.StatusBadRequest, "回收站类型必须为 book 或 document")
		return
	}
	u := currentUser(c)
	if err := a.purgeExpiredTrash(u); err != nil {
		fail(c, http.StatusInternalServerError, "清理过期内容失败")
		return
	}
	if kind == "document" {
		a.listTrashedDocuments(c, u)
		return
	}
	a.listTrashedBooks(c, u)
}

func (a *App) listTrashedBooks(c *gin.Context, u *models.User) {
	page, pageSize := paginate(c)
	query := a.DB.Unscoped().Table("books").Where("books.deleted_at IS NOT NULL")
	if !IsAdmin(u) {
		query = query.Where("books.user_id = ?", u.ID)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询回收站失败")
		return
	}
	type row struct {
		ID            uint
		Title         string
		Slug          string
		TrashGroup    string
		DeletedAt     time.Time
		OwnerUsername string
	}
	rows := []row{}
	if err := query.
		Select("books.id, books.title, books.slug, books.trash_group, books.deleted_at, users.username AS owner_username").
		Joins("LEFT JOIN users ON users.id = books.user_id").
		Order("books.deleted_at DESC").Limit(pageSize).Offset((page - 1) * pageSize).
		Scan(&rows).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询回收站失败")
		return
	}
	items := make([]trashItem, 0, len(rows))
	for _, r := range rows {
		var chapterCount int64
		a.DB.Unscoped().Model(&models.Document{}).
			Where("book_id = ? AND trash_group = ? AND deleted_at IS NOT NULL", r.ID, r.TrashGroup).
			Count(&chapterCount)
		items = append(items, trashItem{
			Type: "book", ID: r.ID, Title: r.Title, Slug: r.Slug,
			OwnerUsername: r.OwnerUsername, DescendantCount: chapterCount,
			DeletedAt: r.DeletedAt, ExpiresAt: r.DeletedAt.Add(trashRetention),
		})
	}
	ok(c, PageResult{Items: items, Total: total, Page: page, PageSize: pageSize})
}

func (a *App) listTrashedDocuments(c *gin.Context, u *models.User) {
	page, pageSize := paginate(c)
	query := a.DB.Unscoped().Table("documents").
		Joins("JOIN books ON books.id = documents.book_id AND books.deleted_at IS NULL").
		Where("documents.deleted_at IS NOT NULL").
		Where(`NOT EXISTS (
			SELECT 1 FROM documents parent
			WHERE parent.id = documents.parent_id
			AND parent.deleted_at IS NOT NULL
			AND parent.trash_group = documents.trash_group
		)`)
	if !IsAdmin(u) {
		query = query.Where("books.user_id = ?", u.ID)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询回收站失败")
		return
	}
	type row struct {
		ID            uint
		Title         string
		Slug          string
		BookID        uint
		BookTitle     string
		BookSlug      string
		TrashGroup    string
		DeletedAt     time.Time
		OwnerUsername string
	}
	rows := []row{}
	if err := query.
		Select(`documents.id, documents.title, documents.slug, documents.book_id,
			books.title AS book_title, books.slug AS book_slug, documents.trash_group,
			documents.deleted_at, users.username AS owner_username`).
		Joins("LEFT JOIN users ON users.id = books.user_id").
		Order("documents.deleted_at DESC").Limit(pageSize).Offset((page - 1) * pageSize).
		Scan(&rows).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询回收站失败")
		return
	}
	items := make([]trashItem, 0, len(rows))
	for _, r := range rows {
		var groupCount int64
		a.DB.Unscoped().Model(&models.Document{}).
			Where("book_id = ? AND trash_group = ? AND deleted_at IS NOT NULL", r.BookID, r.TrashGroup).
			Count(&groupCount)
		items = append(items, trashItem{
			Type: "document", ID: r.ID, Title: r.Title, Slug: r.Slug,
			BookID: r.BookID, BookTitle: r.BookTitle, BookSlug: r.BookSlug,
			OwnerUsername: r.OwnerUsername, DescendantCount: maxInt64(groupCount-1, 0),
			DeletedAt: r.DeletedAt, ExpiresAt: r.DeletedAt.Add(trashRetention),
		})
	}
	ok(c, PageResult{Items: items, Total: total, Page: page, PageSize: pageSize})
}

// RestoreTrashedBook POST /trash/books/:id/restore 恢复书籍以及同一删除批次的章节。
func (a *App) RestoreTrashedBook(c *gin.Context) {
	var book models.Book
	if err := a.DB.Unscoped().Where("id = ? AND deleted_at IS NOT NULL", c.Param("id")).First(&book).Error; err != nil {
		fail(c, http.StatusNotFound, "回收站中不存在该书籍")
		return
	}
	if !a.canManageBook(currentUser(c), &book) {
		fail(c, http.StatusNotFound, "回收站中不存在该书籍")
		return
	}
	if a.trashExpired(book.DeletedAt.Time) {
		_ = a.DB.Transaction(func(tx *gorm.DB) error { return hardDeleteBook(tx, book.ID) })
		fail(c, http.StatusGone, "该书籍已超过 30 天保留期")
		return
	}
	if err := a.DB.Transaction(func(tx *gorm.DB) error {
		if err := restoreTrashGroup(tx, &models.Document{}, "book_id = ? AND trash_group = ?", book.ID, book.TrashGroup); err != nil {
			return err
		}
		return restoreTrashGroup(tx, &models.Book{}, "id = ?", book.ID)
	}); err != nil {
		fail(c, http.StatusInternalServerError, "恢复书籍失败")
		return
	}
	ok(c, gin.H{"message": "书籍已恢复", "id": book.ID, "slug": book.Slug})
}

// PermanentlyDeleteBook DELETE /trash/books/:id 永久删除书籍及全部关联内容。
func (a *App) PermanentlyDeleteBook(c *gin.Context) {
	var book models.Book
	if err := a.DB.Unscoped().Where("id = ? AND deleted_at IS NOT NULL", c.Param("id")).First(&book).Error; err != nil {
		fail(c, http.StatusNotFound, "回收站中不存在该书籍")
		return
	}
	if !a.canManageBook(currentUser(c), &book) {
		fail(c, http.StatusNotFound, "回收站中不存在该书籍")
		return
	}
	if err := a.DB.Transaction(func(tx *gorm.DB) error { return hardDeleteBook(tx, book.ID) }); err != nil {
		fail(c, http.StatusInternalServerError, "永久删除书籍失败")
		return
	}
	ok(c, gin.H{"message": "书籍已永久删除"})
}

// RestoreTrashedDocument POST /trash/documents/:id/restore 恢复同一批次的完整章节子树。
func (a *App) RestoreTrashedDocument(c *gin.Context) {
	doc, book := a.findTrashedDocument(c)
	if doc == nil {
		return
	}
	if book.DeletedAt.Valid {
		if !a.canManageBook(currentUser(c), book) {
			fail(c, http.StatusNotFound, "回收站中不存在该章节")
			return
		}
		fail(c, http.StatusConflict, "所属书籍也在回收站，请从书籍条目操作")
		return
	}
	if !a.canEditBookContent(currentUser(c), book) {
		fail(c, http.StatusNotFound, "回收站中不存在该章节")
		return
	}
	if a.trashExpired(doc.DeletedAt.Time) {
		_ = a.DB.Transaction(func(tx *gorm.DB) error { return hardDeleteDocumentGroup(tx, doc.BookID, doc.TrashGroup) })
		fail(c, http.StatusGone, "该章节已超过 30 天保留期")
		return
	}
	if doc.ParentID != nil {
		var parent models.Document
		if err := a.DB.Unscoped().First(&parent, *doc.ParentID).Error; err == nil && parent.DeletedAt.Valid && parent.TrashGroup != doc.TrashGroup {
			fail(c, http.StatusConflict, "父章节仍在回收站，请先恢复父章节")
			return
		}
	}
	if err := restoreTrashGroup(a.DB, &models.Document{}, "book_id = ? AND trash_group = ?", doc.BookID, doc.TrashGroup); err != nil {
		fail(c, http.StatusInternalServerError, "恢复章节失败")
		return
	}
	ok(c, gin.H{"message": "章节已恢复", "id": doc.ID, "book_slug": book.Slug})
}

// PermanentlyDeleteDocument DELETE /trash/documents/:id 永久删除同一批次的章节子树。
func (a *App) PermanentlyDeleteDocument(c *gin.Context) {
	doc, book := a.findTrashedDocument(c)
	if doc == nil {
		return
	}
	if !a.canManageBook(currentUser(c), book) {
		fail(c, http.StatusNotFound, "回收站中不存在该章节")
		return
	}
	if book.DeletedAt.Valid {
		fail(c, http.StatusConflict, "所属书籍也在回收站，请从书籍条目操作")
		return
	}
	if err := a.DB.Transaction(func(tx *gorm.DB) error { return hardDeleteDocumentGroup(tx, doc.BookID, doc.TrashGroup) }); err != nil {
		fail(c, http.StatusInternalServerError, "永久删除章节失败")
		return
	}
	ok(c, gin.H{"message": "章节已永久删除"})
}

func (a *App) findTrashedDocument(c *gin.Context) (*models.Document, *models.Book) {
	var doc models.Document
	if err := a.DB.Unscoped().Where("id = ? AND deleted_at IS NOT NULL", c.Param("id")).First(&doc).Error; err != nil {
		fail(c, http.StatusNotFound, "回收站中不存在该章节")
		return nil, nil
	}
	var book models.Book
	if err := a.DB.Unscoped().First(&book, doc.BookID).Error; err != nil {
		fail(c, http.StatusNotFound, "回收站中不存在该章节")
		return nil, nil
	}
	return &doc, &book
}

func (a *App) trashExpired(deletedAt time.Time) bool {
	return deletedAt.Add(trashRetention).Before(currentTime())
}

func (a *App) purgeExpiredTrash(u *models.User) error {
	cutoff := currentTime().Add(-trashRetention)
	booksQuery := a.DB.Unscoped().Where("deleted_at IS NOT NULL AND deleted_at < ?", cutoff)
	if !IsAdmin(u) {
		booksQuery = booksQuery.Where("user_id = ?", u.ID)
	}
	expiredBooks := []models.Book{}
	if err := booksQuery.Find(&expiredBooks).Error; err != nil {
		return err
	}
	for _, book := range expiredBooks {
		if err := a.DB.Transaction(func(tx *gorm.DB) error { return hardDeleteBook(tx, book.ID) }); err != nil {
			return err
		}
	}
	type groupRow struct {
		BookID     uint
		TrashGroup string
	}
	docQuery := a.DB.Unscoped().Table("documents").
		Select("documents.book_id, documents.trash_group").
		Joins("JOIN books ON books.id = documents.book_id AND books.deleted_at IS NULL").
		Where("documents.deleted_at IS NOT NULL AND documents.deleted_at < ?", cutoff).
		Where("documents.trash_group <> ''")
	if !IsAdmin(u) {
		docQuery = docQuery.Where("books.user_id = ?", u.ID)
	}
	groups := []groupRow{}
	if err := docQuery.Group("documents.book_id, documents.trash_group").Scan(&groups).Error; err != nil {
		return err
	}
	for _, group := range groups {
		if err := a.DB.Transaction(func(tx *gorm.DB) error { return hardDeleteDocumentGroup(tx, group.BookID, group.TrashGroup) }); err != nil {
			return err
		}
	}
	return nil
}

func restoreTrashGroup(tx *gorm.DB, model any, where string, args ...any) error {
	return tx.Unscoped().Model(model).Where(where, args...).Updates(map[string]any{
		"deleted_at": nil, "deleted_by": 0, "trash_group": "",
	}).Error
}

func hardDeleteDocumentGroup(tx *gorm.DB, bookID uint, group string) error {
	ids := []uint{}
	if err := tx.Unscoped().Model(&models.Document{}).
		Where("book_id = ? AND trash_group = ?", bookID, group).Pluck("id", &ids).Error; err != nil {
		return err
	}
	return hardDeleteDocuments(tx, ids)
}

func hardDeleteDocuments(tx *gorm.DB, ids []uint) error {
	if len(ids) == 0 {
		return nil
	}
	for _, deletion := range []struct {
		model any
		where string
	}{
		{&models.Comment{}, "document_id IN ?"},
		{&models.DocumentRevision{}, "document_id IN ?"},
		{&models.ReadChapter{}, "doc_id IN ?"},
		{&models.ReadingProgress{}, "doc_id IN ?"},
	} {
		if err := tx.Unscoped().Where(deletion.where, ids).Delete(deletion.model).Error; err != nil {
			return err
		}
	}
	return tx.Unscoped().Where("id IN ?", ids).Delete(&models.Document{}).Error
}

func hardDeleteBook(tx *gorm.DB, bookID uint) error {
	docIDs := []uint{}
	if err := tx.Unscoped().Model(&models.Document{}).Where("book_id = ?", bookID).Pluck("id", &docIDs).Error; err != nil {
		return err
	}
	if err := hardDeleteDocuments(tx, docIDs); err != nil {
		return err
	}
	for _, deletion := range []struct {
		model any
		where string
	}{
		{&models.Reaction{}, "book_id = ?"},
		{&models.ReadingProgress{}, "book_id = ?"},
		{&models.ReadChapter{}, "book_id = ?"},
		{&models.BookCollaborator{}, "book_id = ?"},
		{&models.BookTag{}, "book_id = ?"},
	} {
		if err := tx.Unscoped().Where(deletion.where, bookID).Delete(deletion.model).Error; err != nil {
			return err
		}
	}
	return tx.Unscoped().Where("id = ?", bookID).Delete(&models.Book{}).Error
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
