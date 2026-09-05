package app

import (
	"net/http"
	"sort"
	"strconv"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var docStatuses = map[string]bool{"draft": true, "published": true, "archived": true}

// ListDocumentTree GET /books/:id/documents 返回文档树（不含正文）
func (a *App) ListDocumentTree(c *gin.Context) {
	book, status := a.findBook(c)
	if book == nil {
		fail(c, status, "书籍不存在")
		return
	}
	u := currentUser(c)

	var docs []models.Document
	query := a.DB.Where("book_id = ?", book.ID).
		Select("id", "book_id", "parent_id", "title", "slug", "user_id", "sort_order", "status", "created_at", "updated_at")
	if !a.canManageBook(u, book) {
		query = query.Where("status = ?", "published")
	}
	if err := query.Order("sort_order ASC, created_at ASC").Find(&docs).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询失败")
		return
	}
	ok(c, buildDocTree(docs, nil))
}

// buildDocTree 将平铺文档列表组装为树
func buildDocTree(docs []models.Document, parent *uint) []*models.Document {
	var result []*models.Document
	for i := range docs {
		doc := &docs[i]
		if (doc.ParentID == nil && parent == nil) || (doc.ParentID != nil && parent != nil && *doc.ParentID == *parent) {
			doc.Children = buildDocTree(docs, &doc.ID)
			result = append(result, doc)
		}
	}
	sort.SliceStable(result, func(i, j int) bool {
		if result[i].SortOrder != result[j].SortOrder {
			return result[i].SortOrder < result[j].SortOrder
		}
		return result[i].CreatedAt.Before(result[j].CreatedAt)
	})
	return result
}

type documentPayload struct {
	Title     *string `json:"title"`
	Slug      *string `json:"slug"`
	Content   *string `json:"content"`
	ParentID  *uint   `json:"parent_id"`
	SortOrder *int    `json:"sort_order"`
	Status    *string `json:"status"`
}

// CreateDocument POST /books/:id/documents
func (a *App) CreateDocument(c *gin.Context) {
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

	var req documentPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if req.Title == nil || *req.Title == "" {
		fail(c, http.StatusBadRequest, "请填写文档标题")
		return
	}
	statusStr := "draft"
	if req.Status != nil && docStatuses[*req.Status] {
		statusStr = *req.Status
	}
	if req.ParentID != nil {
		var parent models.Document
		if err := a.DB.Where("id = ? AND book_id = ?", *req.ParentID, book.ID).First(&parent).Error; err != nil {
			fail(c, http.StatusBadRequest, "父文档不存在")
			return
		}
	}

	doc := models.Document{
		BookID:  book.ID,
		Title:   *req.Title,
		UserID:  u.ID,
		Status:  statusStr,
		Content: "",
	}
	if req.ParentID != nil {
		doc.ParentID = req.ParentID
	}
	if req.Content != nil {
		doc.Content = *req.Content
	}
	if req.SortOrder != nil {
		doc.SortOrder = *req.SortOrder
	}

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

	for i := 0; i < 50; i++ {
		candidate := slug
		if candidate == "" {
			candidate = randomSlug("doc")
		} else if i > 0 {
			candidate = slug + "-" + strconv.Itoa(i+1)
		}
		var count int64
		a.DB.Model(&models.Document{}).Where("book_id = ? AND slug = ?", book.ID, candidate).Count(&count)
		if count == 0 {
			doc.Slug = candidate
			break
		}
	}
	if doc.Slug == "" {
		fail(c, http.StatusConflict, "slug 生成失败，请手动指定")
		return
	}

	if err := a.DB.Create(&doc).Error; err != nil {
		fail(c, http.StatusInternalServerError, "创建失败: "+err.Error())
		return
	}
	ok(c, doc)
}

// findDocument 查找文档及其所属书籍
func (a *App) findDocument(c *gin.Context) (*models.Document, *models.Book, int) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return nil, nil, http.StatusBadRequest
	}
	var doc models.Document
	if err := a.DB.First(&doc, id).Error; err != nil {
		return nil, nil, http.StatusNotFound
	}
	var book models.Book
	if err := a.DB.First(&book, doc.BookID).Error; err != nil {
		return nil, nil, http.StatusNotFound
	}
	return &doc, &book, http.StatusOK
}

// canReadDocument 判断文档是否对当前用户可见
func (a *App) canReadDocument(u *models.User, doc *models.Document, book *models.Book) bool {
	if a.canManageBook(u, book) {
		return true
	}
	return book.IsPublic && book.Status == "published" && doc.Status == "published"
}

// GetDocument GET /documents/:id
func (a *App) GetDocument(c *gin.Context) {
	doc, book, status := a.findDocument(c)
	if doc == nil {
		fail(c, status, "文档不存在")
		return
	}
	if !a.canReadDocument(currentUser(c), doc, book) {
		fail(c, http.StatusForbidden, "无权访问该文档")
		return
	}
	ok(c, doc)
}

// GetDocumentBySlug GET /books/:id/documents/slug/:slug
func (a *App) GetDocumentBySlug(c *gin.Context) {
	book, status := a.findBook(c)
	if book == nil {
		fail(c, status, "书籍不存在")
		return
	}
	var doc models.Document
	if err := a.DB.Where("book_id = ? AND slug = ?", book.ID, c.Param("slug")).First(&doc).Error; err != nil {
		fail(c, http.StatusNotFound, "文档不存在")
		return
	}
	if !a.canReadDocument(currentUser(c), &doc, book) {
		fail(c, http.StatusForbidden, "无权访问该文档")
		return
	}
	ok(c, doc)
}

// UpdateDocument PUT /documents/:id
func (a *App) UpdateDocument(c *gin.Context) {
	doc, book, status := a.findDocument(c)
	if doc == nil {
		fail(c, status, "文档不存在")
		return
	}
	if !a.canManageBook(currentUser(c), book) {
		fail(c, http.StatusForbidden, "无权操作该文档")
		return
	}

	var req documentPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if req.Title != nil && *req.Title != "" {
		doc.Title = *req.Title
	}
	if req.Content != nil {
		doc.Content = *req.Content
	}
	if req.SortOrder != nil {
		doc.SortOrder = *req.SortOrder
	}
	if req.Status != nil && docStatuses[*req.Status] {
		doc.Status = *req.Status
	}
	if req.Slug != nil && *req.Slug != doc.Slug {
		if !validSlug(*req.Slug) {
			fail(c, http.StatusBadRequest, "slug 仅支持小写字母、数字和中划线")
			return
		}
		var count int64
		a.DB.Model(&models.Document{}).Where("book_id = ? AND slug = ? AND id != ?", book.ID, *req.Slug, doc.ID).Count(&count)
		if count > 0 {
			fail(c, http.StatusConflict, "slug 已被占用")
			return
		}
		doc.Slug = *req.Slug
	}
	if req.ParentID != nil && (doc.ParentID == nil || *req.ParentID != *doc.ParentID) {
		if *req.ParentID == doc.ID {
			fail(c, http.StatusBadRequest, "父文档不能是自身")
			return
		}
		var parent models.Document
		if err := a.DB.Where("id = ? AND book_id = ?", *req.ParentID, book.ID).First(&parent).Error; err != nil {
			fail(c, http.StatusBadRequest, "父文档不存在")
			return
		}
		// 检查是否会把文档移动到自己的后代下
		if isDescendant(a.DB, doc.ID, *req.ParentID) {
			fail(c, http.StatusBadRequest, "不能将文档移动到自己的子文档下")
			return
		}
		doc.ParentID = req.ParentID
	}

	if err := a.DB.Save(doc).Error; err != nil {
		fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
		return
	}
	ok(c, doc)
}

// isDescendant 判断 candidateId 是否位于 rootId 的子树中
func isDescendant(db *gorm.DB, rootID, candidateID uint) bool {
	frontier := []uint{rootID}
	for len(frontier) > 0 {
		var next []uint
		for _, pid := range frontier {
			var children []uint
			db.Model(&models.Document{}).Where("parent_id = ?", pid).Pluck("id", &children)
			for _, cid := range children {
				if cid == candidateID {
					return true
				}
				next = append(next, cid)
			}
		}
		frontier = next
	}
	return false
}

// DeleteDocument DELETE /documents/:id 递归删除子文档
func (a *App) DeleteDocument(c *gin.Context) {
	doc, book, status := a.findDocument(c)
	if doc == nil {
		fail(c, status, "文档不存在")
		return
	}
	if !a.canManageBook(currentUser(c), book) {
		fail(c, http.StatusForbidden, "无权操作该文档")
		return
	}

	ids := []uint{doc.ID}
	frontier := []uint{doc.ID}
	for len(frontier) > 0 {
		var next []uint
		for _, pid := range frontier {
			var children []uint
			a.DB.Model(&models.Document{}).Where("parent_id = ?", pid).Pluck("id", &children)
			ids = append(ids, children...)
			next = append(next, children...)
		}
		frontier = next
	}
	if err := a.DB.Where("id IN ?", ids).Delete(&models.Document{}).Error; err != nil {
		fail(c, http.StatusInternalServerError, "删除失败: "+err.Error())
		return
	}
	ok(c, gin.H{"message": "已删除", "count": len(ids)})
}
