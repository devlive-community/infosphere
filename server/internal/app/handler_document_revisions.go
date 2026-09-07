package app

import (
	"errors"
	"net/http"
	"strconv"
	"time"
	"unicode/utf8"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type revisionAuthor struct {
	ID       uint   `json:"id"`
	Username string `json:"username"`
	Avatar   string `json:"avatar"`
}

type documentRevisionResponse struct {
	ID            uint            `json:"id"`
	DocumentID    uint            `json:"document_id"`
	BookID        uint            `json:"book_id"`
	Title         string          `json:"title"`
	Content       *string         `json:"content,omitempty"`
	ContentLength int             `json:"content_length"`
	Status        string          `json:"status"`
	AllowComments bool            `json:"allow_comments"`
	Reason        string          `json:"reason"`
	Author        *revisionAuthor `json:"author,omitempty"`
	CreatedAt     time.Time       `json:"created_at"`
}

func newDocumentRevision(doc *models.Document, userID uint, reason string) models.DocumentRevision {
	allowComments := true
	if doc.AllowComments != nil {
		allowComments = *doc.AllowComments
	}
	return models.DocumentRevision{
		DocumentID:    doc.ID,
		BookID:        doc.BookID,
		UserID:        userID,
		Title:         doc.Title,
		Content:       doc.Content,
		Status:        doc.Status,
		AllowComments: allowComments,
		Reason:        reason,
	}
}

func revisionResponse(revision models.DocumentRevision, author *models.User, includeContent bool) documentRevisionResponse {
	response := documentRevisionResponse{
		ID:            revision.ID,
		DocumentID:    revision.DocumentID,
		BookID:        revision.BookID,
		Title:         revision.Title,
		ContentLength: utf8.RuneCountInString(revision.Content),
		Status:        revision.Status,
		AllowComments: revision.AllowComments,
		Reason:        revision.Reason,
		CreatedAt:     revision.CreatedAt,
	}
	if includeContent {
		response.Content = &revision.Content
	}
	if author != nil {
		response.Author = &revisionAuthor{ID: author.ID, Username: author.Username, Avatar: author.Avatar}
	}
	return response
}

// editableRevisionDocument 版本历史属于写作域，只有可编辑章节内容的用户可访问。
// 未授权统一返回 404，避免枚举私有章节或协作关系。
func (a *App) editableRevisionDocument(c *gin.Context) (*models.Document, *models.Book) {
	doc, book, status := a.findDocument(c)
	if doc == nil {
		fail(c, status, "文档不存在")
		return nil, nil
	}
	if !a.canEditBookContent(currentUser(c), book) {
		fail(c, http.StatusNotFound, "文档不存在")
		return nil, nil
	}
	return doc, book
}

// ListDocumentRevisions GET /documents/:id/revisions
func (a *App) ListDocumentRevisions(c *gin.Context) {
	doc, _ := a.editableRevisionDocument(c)
	if doc == nil {
		return
	}
	page, pageSize := paginate(c)
	if pageSize > 50 {
		pageSize = 50
	}

	query := a.DB.Model(&models.DocumentRevision{}).Where("document_id = ?", doc.ID)
	var total int64
	if err := query.Count(&total).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询版本历史失败")
		return
	}
	var revisions []models.DocumentRevision
	if err := query.Order("created_at DESC, id DESC").Limit(pageSize).Offset((page - 1) * pageSize).Find(&revisions).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询版本历史失败")
		return
	}

	userIDs := make([]uint, 0, len(revisions))
	for _, revision := range revisions {
		userIDs = append(userIDs, revision.UserID)
	}
	authors := map[uint]models.User{}
	if len(userIDs) > 0 {
		var users []models.User
		if err := a.DB.Select("id", "username", "avatar").Where("id IN ?", userIDs).Find(&users).Error; err != nil {
			fail(c, http.StatusInternalServerError, "查询版本作者失败")
			return
		}
		for _, user := range users {
			authors[user.ID] = user
		}
	}

	items := make([]documentRevisionResponse, 0, len(revisions))
	for _, revision := range revisions {
		author, found := authors[revision.UserID]
		if found {
			items = append(items, revisionResponse(revision, &author, false))
		} else {
			items = append(items, revisionResponse(revision, nil, false))
		}
	}
	ok(c, PageResult{Items: items, Total: total, Page: page, PageSize: pageSize})
}

// GetDocumentRevision GET /documents/:id/revisions/:revisionId
func (a *App) GetDocumentRevision(c *gin.Context) {
	doc, _ := a.editableRevisionDocument(c)
	if doc == nil {
		return
	}
	revisionID, err := strconv.ParseUint(c.Param("revisionId"), 10, 64)
	if err != nil {
		fail(c, http.StatusNotFound, "版本不存在")
		return
	}
	var revision models.DocumentRevision
	if err := a.DB.Where("id = ? AND document_id = ?", revisionID, doc.ID).First(&revision).Error; err != nil {
		fail(c, http.StatusNotFound, "版本不存在")
		return
	}
	var author models.User
	var authorPtr *models.User
	if err := a.DB.Select("id", "username", "avatar").First(&author, revision.UserID).Error; err == nil {
		authorPtr = &author
	}
	ok(c, revisionResponse(revision, authorPtr, true))
}

// RestoreDocumentRevision POST /documents/:id/revisions/:revisionId/restore
func (a *App) RestoreDocumentRevision(c *gin.Context) {
	doc, _ := a.editableRevisionDocument(c)
	if doc == nil {
		return
	}
	revisionID, err := strconv.ParseUint(c.Param("revisionId"), 10, 64)
	if err != nil {
		fail(c, http.StatusNotFound, "版本不存在")
		return
	}
	u := currentUser(c)

	var restored models.Document
	err = a.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&restored, doc.ID).Error; err != nil {
			return err
		}
		var target models.DocumentRevision
		if err := tx.Where("id = ? AND document_id = ?", revisionID, restored.ID).First(&target).Error; err != nil {
			return err
		}

		before := newDocumentRevision(&restored, u.ID, "pre_restore")
		if err := tx.Create(&before).Error; err != nil {
			return err
		}
		restored.Title = target.Title
		restored.Content = target.Content
		restored.Status = target.Status
		allowComments := target.AllowComments
		restored.AllowComments = &allowComments
		if err := tx.Save(&restored).Error; err != nil {
			return err
		}
		after := newDocumentRevision(&restored, u.ID, "restore")
		return tx.Create(&after).Error
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			fail(c, http.StatusNotFound, "版本不存在")
			return
		}
		fail(c, http.StatusInternalServerError, "恢复版本失败")
		return
	}
	ok(c, restored)
}
