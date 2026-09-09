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

var annotationKinds = map[string]bool{"highlight": true, "note": true, "bookmark": true}
var annotationColors = map[string]bool{"yellow": true, "green": true, "blue": true, "pink": true, "purple": true}
var annotationStatuses = map[string]bool{"active": true, "relocated": true, "orphaned": true}

type annotationPayload struct {
	Kind         *string `json:"kind"`
	Color        *string `json:"color"`
	Note         *string `json:"note"`
	Quote        *string `json:"quote"`
	Prefix       *string `json:"prefix"`
	Suffix       *string `json:"suffix"`
	StartOffset  *int    `json:"start_offset"`
	EndOffset    *int    `json:"end_offset"`
	AnchorStatus *string `json:"anchor_status"`
}

type myAnnotationRow struct {
	models.ReadingAnnotation
	BookTitle     string `json:"book_title"`
	BookSlug      string `json:"book_slug"`
	DocumentTitle string `json:"document_title"`
	DocumentSlug  string `json:"document_slug"`
}

// ListDocumentAnnotations GET /documents/:id/annotations 返回当前用户在本章的私人数据。
func (a *App) ListDocumentAnnotations(c *gin.Context) {
	doc, book, status := a.findDocument(c)
	if doc == nil || !a.canReadDocument(currentUser(c), doc, book) {
		fail(c, mapHiddenStatus(status), "章节不存在")
		return
	}
	items := []models.ReadingAnnotation{}
	if err := a.DB.Where("user_id = ? AND document_id = ?", currentUser(c).ID, doc.ID).
		Order("created_at ASC").Find(&items).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询标注失败")
		return
	}
	ok(c, items)
}

// CreateDocumentAnnotation POST /documents/:id/annotations 创建划线、笔记或书签。
func (a *App) CreateDocumentAnnotation(c *gin.Context) {
	doc, book, status := a.findDocument(c)
	u := currentUser(c)
	if doc == nil || !a.canReadDocument(u, doc, book) {
		fail(c, mapHiddenStatus(status), "章节不存在")
		return
	}
	var req annotationPayload
	if err := c.ShouldBindJSON(&req); err != nil || req.Kind == nil || !annotationKinds[*req.Kind] {
		fail(c, http.StatusBadRequest, "标注类型无效")
		return
	}
	annotation, message := buildAnnotation(u.ID, book.ID, doc.ID, req)
	if message != "" {
		fail(c, http.StatusBadRequest, message)
		return
	}
	if annotation.Kind == "bookmark" {
		if err := a.DB.Transaction(func(tx *gorm.DB) error {
			if err := tx.Where("user_id = ? AND document_id = ? AND kind = ?", u.ID, doc.ID, "bookmark").
				Delete(&models.ReadingAnnotation{}).Error; err != nil {
				return err
			}
			return tx.Create(&annotation).Error
		}); err != nil {
			fail(c, http.StatusInternalServerError, "保存书签失败")
			return
		}
	} else if err := a.DB.Create(&annotation).Error; err != nil {
		fail(c, http.StatusInternalServerError, "保存标注失败")
		return
	}
	ok(c, annotation)
}

func buildAnnotation(userID, bookID, documentID uint, req annotationPayload) (models.ReadingAnnotation, string) {
	kind := strings.TrimSpace(*req.Kind)
	color := "yellow"
	if req.Color != nil && annotationColors[*req.Color] {
		color = *req.Color
	}
	annotation := models.ReadingAnnotation{UserID: userID, BookID: bookID, DocumentID: documentID, Kind: kind, Color: color, AnchorStatus: "active"}
	if req.Note != nil {
		annotation.Note = strings.TrimSpace(*req.Note)
	}
	if kind == "bookmark" {
		return annotation, ""
	}
	if req.Quote == nil || strings.TrimSpace(*req.Quote) == "" || req.StartOffset == nil || req.EndOffset == nil || *req.StartOffset < 0 || *req.EndOffset <= *req.StartOffset {
		return annotation, "请选择需要标注的正文"
	}
	annotation.Quote = strings.TrimSpace(*req.Quote)
	annotation.StartOffset, annotation.EndOffset = *req.StartOffset, *req.EndOffset
	if req.Prefix != nil {
		annotation.Prefix = trimRunes(*req.Prefix, 200)
	}
	if req.Suffix != nil {
		annotation.Suffix = trimRunes(*req.Suffix, 200)
	}
	if utf8.RuneCountInString(annotation.Quote) > 4000 {
		return annotation, "选中的正文过长"
	}
	if kind == "note" && annotation.Note == "" {
		return annotation, "请填写笔记内容"
	}
	if utf8.RuneCountInString(annotation.Note) > 10000 {
		return annotation, "笔记内容不能超过 10000 个字符"
	}
	return annotation, ""
}

// UpdateAnnotation PUT /annotations/:id 仅允许当前用户修改自己的数据。
func (a *App) UpdateAnnotation(c *gin.Context) {
	annotation := a.findOwnAnnotation(c)
	if annotation == nil {
		return
	}
	var req annotationPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	updates := map[string]any{}
	if req.Note != nil {
		note := strings.TrimSpace(*req.Note)
		if annotation.Kind == "note" && note == "" {
			fail(c, http.StatusBadRequest, "请填写笔记内容")
			return
		}
		if utf8.RuneCountInString(note) > 10000 {
			fail(c, http.StatusBadRequest, "笔记内容不能超过 10000 个字符")
			return
		}
		updates["note"] = note
	}
	if req.Color != nil && annotationColors[*req.Color] {
		updates["color"] = *req.Color
	}
	if req.StartOffset != nil && *req.StartOffset >= 0 {
		updates["start_offset"] = *req.StartOffset
	}
	if req.EndOffset != nil && *req.EndOffset > 0 {
		updates["end_offset"] = *req.EndOffset
	}
	if req.AnchorStatus != nil && annotationStatuses[*req.AnchorStatus] {
		updates["anchor_status"] = *req.AnchorStatus
	}
	start, end := annotation.StartOffset, annotation.EndOffset
	if value, ok := updates["start_offset"].(int); ok {
		start = value
	}
	if value, ok := updates["end_offset"].(int); ok {
		end = value
	}
	if annotation.Kind != "bookmark" && end <= start {
		fail(c, http.StatusBadRequest, "标注位置无效")
		return
	}
	if len(updates) == 0 {
		fail(c, http.StatusBadRequest, "没有可更新的内容")
		return
	}
	if err := a.DB.Model(annotation).Updates(updates).Error; err != nil {
		fail(c, http.StatusInternalServerError, "更新标注失败")
		return
	}
	a.DB.First(annotation, annotation.ID)
	ok(c, annotation)
}

// DeleteAnnotation DELETE /annotations/:id 仅允许当前用户删除自己的数据。
func (a *App) DeleteAnnotation(c *gin.Context) {
	annotation := a.findOwnAnnotation(c)
	if annotation == nil {
		return
	}
	if err := a.DB.Delete(annotation).Error; err != nil {
		fail(c, http.StatusInternalServerError, "删除标注失败")
		return
	}
	ok(c, gin.H{"message": "已删除"})
}

func (a *App) findOwnAnnotation(c *gin.Context) *models.ReadingAnnotation {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return nil
	}
	var annotation models.ReadingAnnotation
	if err := a.DB.Where("id = ? AND user_id = ?", id, currentUser(c).ID).First(&annotation).Error; err != nil {
		fail(c, http.StatusNotFound, "标注不存在")
		return nil
	}
	return &annotation
}

// ListMyAnnotations GET /users/me/annotations 聚合当前用户仍有权访问的私人标注。
func (a *App) ListMyAnnotations(c *gin.Context) {
	u := currentUser(c)
	page, pageSize := paginate(c)
	kind := strings.TrimSpace(c.Query("kind"))
	if kind != "" && !annotationKinds[kind] {
		fail(c, http.StatusBadRequest, "标注类型无效")
		return
	}
	query := a.DB.Table("reading_annotations").
		Joins("JOIN books ON books.id = reading_annotations.book_id AND books.deleted_at IS NULL").
		Joins("JOIN documents ON documents.id = reading_annotations.document_id AND documents.deleted_at IS NULL").
		Where("reading_annotations.user_id = ?", u.ID)
	if !IsAdmin(u) {
		query = query.Where(`(
			books.user_id = ? OR
			(books.is_public = ? AND books.status IN ? AND documents.status = ?) OR
			EXISTS (SELECT 1 FROM book_collaborators bc WHERE bc.book_id = books.id AND bc.user_id = ? AND bc.status = ? AND (bc.role = ? OR documents.status = ?))
		)`, u.ID, true, []string{"in_progress", "published", "completed"}, "published", u.ID, "accepted", "editor", "published")
	}
	if kind != "" {
		query = query.Where("reading_annotations.kind = ?", kind)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询笔记失败")
		return
	}
	items := []myAnnotationRow{}
	if err := query.Select(`reading_annotations.*, books.title AS book_title, books.slug AS book_slug,
		documents.title AS document_title, documents.slug AS document_slug`).
		Order("reading_annotations.updated_at DESC").Limit(pageSize).Offset((page - 1) * pageSize).Scan(&items).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询笔记失败")
		return
	}
	ok(c, PageResult{Items: items, Total: total, Page: page, PageSize: pageSize})
}

func trimRunes(value string, limit int) string {
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit])
}

func mapHiddenStatus(status int) int {
	if status == http.StatusBadRequest {
		return status
	}
	return http.StatusNotFound
}
