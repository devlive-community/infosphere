package app

import (
	"fmt"
	"net/http"
	"strconv"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

type commentPayload struct {
	Content  *string `json:"content"`
	ParentID *uint   `json:"parent_id"`
}

func (a *App) canManageComment(c *gin.Context, comment *models.Comment, book *models.Book) bool {
	u := currentUser(c)
	if u == nil {
		return false
	}
	if u.ID == comment.UserID || u.Role == "admin" {
		return true
	}
	// 书籍作者可以管理自己书下的评论
	return book.UserID == u.ID
}

// ListComments GET /documents/:docId/comments 章节评论（两级）
func (a *App) ListComments(c *gin.Context) {
	docID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	var all []models.Comment
	if err := a.DB.Preload("User", func(tx interface{ }) { }).Preload("User").Error; err != nil {
	}
	_ = all
	q := a.DB.Preload("User").Where("document_id = ? AND status = ?", docID, "published").Order("created_at ASC")
	var comments []models.Comment
	if err := q.Find(&comments).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询失败")
		return
	}
	// 组装两级
	byParent := map[uint][]models.Comment{}
	var roots []models.Comment
	for _, cm := range comments {
		if cm.ParentID == nil {
			roots = append(roots, cm)
		} else {
			byParent[*cm.ParentID] = append(byParent[*cm.ParentID], cm)
		}
	}
	type node struct {
		models.Comment
		Replies []models.Comment `json:"replies"`
	}
	build := func(parentID uint) []models.Comment {
		return byParent[parentID]
	}
	_ = build
	result := make([]gin.H, 0, len(roots))
	for _, root := range roots {
		replies := byParent[root.ID]
		result = append(result, gin.H{
			"id": root.ID, "user": root.User, "content": root.Content,
			"created_at": root.CreatedAt, "replies": replies,
		})
	}
	ok(c, result)
}

// CreateComment POST /documents/:docId/comments
func (a *App) CreateComment(c *gin.Context) {
	u := currentUser(c)
	docID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	var req struct {
		Content  string `json:"content"`
		ParentID *uint  `json:"parent_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len([]rune(req.Content)) == 0 {
		fail(c, http.StatusBadRequest, "请填写评论内容")
		return
	}
	if len([]rune(req.Content)) > 2000 {
		fail(c, http.StatusBadRequest, "评论最多 2000 字")
		return
	}

	var doc models.Document
	if err := a.DB.First(&doc, docID).Error; err != nil {
		fail(c, http.StatusNotFound, "章节不存在")
		return
	}
	var book models.Book
	if err := a.DB.First(&book, doc.BookID).Error; err != nil {
		fail(c, http.StatusNotFound, "书籍不存在")
		return
	}

	comment := models.Comment{
		DocumentID: doc.ID,
		UserID:     u.ID,
		Content:    req.Content,
		Status:     "published",
	}
	if req.ParentID != nil {
		var parent models.Comment
		if err := a.DB.Where("id = ? AND document_id = ?", *req.ParentID, doc.ID).First(&parent).Error; err != nil {
			fail(c, http.StatusBadRequest, "父评论不存在")
			return
		}
		comment.ParentID = req.ParentID
	}
	if err := a.DB.Create(&comment).Error; err != nil {
		fail(c, http.StatusInternalServerError, "发表失败: "+err.Error())
		return
	}
	a.DB.Preload("User").First(&comment, comment.ID)

	// M13 通知触发：书籍作者 + 被回复人（不通知操作者本人，作者与被回复人重复时只发一条）
	readerLink := fmt.Sprintf("/book/reader/%s/%s", book.Slug, doc.Slug)
	if book.UserID != u.ID {
		a.Notify(book.UserID, "comment",
			fmt.Sprintf("「%s」评论了你的章节《%s》", u.Username, doc.Title),
			map[string]any{"link": readerLink})
	}
	if comment.ParentID != nil {
		var parent models.Comment
		if err := a.DB.First(&parent, *comment.ParentID).Error; err == nil &&
			parent.UserID != u.ID && parent.UserID != book.UserID {
			a.Notify(parent.UserID, "comment",
				fmt.Sprintf("「%s」回复了你的评论", u.Username),
				map[string]any{"link": readerLink})
		}
	}
	ok(c, comment)
}

// UpdateComment PUT /comments/:id 编辑自己的评论
func (a *App) UpdateComment(c *gin.Context) {
	u := currentUser(c)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	var comment models.Comment
	if err := a.DB.First(&comment, id).Error; err != nil {
		fail(c, http.StatusNotFound, "评论不存在")
		return
	}
	if comment.UserID != u.ID {
		fail(c, http.StatusForbidden, "只能编辑自己的评论")
		return
	}
	var req struct {
		Content string `json:"content"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len([]rune(req.Content)) == 0 {
		fail(c, http.StatusBadRequest, "请填写评论内容")
		return
	}
	comment.Content = req.Content
	a.DB.Save(&comment)
	ok(c, comment)
}

// DeleteComment DELETE /comments/:id 本人或书籍作者/管理员
func (a *App) DeleteComment(c *gin.Context) {
	u := currentUser(c)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	var comment models.Comment
	if err := a.DB.First(&comment, id).Error; err != nil {
		fail(c, http.StatusNotFound, "评论不存在")
		return
	}
	var book models.Book
	if err := a.DB.First(&book, comment.DocumentID).Error; err != nil {
		fail(c, http.StatusNotFound, "书籍不存在")
		return
	}
	if comment.UserID != u.ID && u.Role != "admin" && book.UserID != u.ID {
		fail(c, http.StatusForbidden, "无权删除该评论")
		return
	}
	a.DB.Delete(&comment)
	ok(c, gin.H{"message": "已删除"})
}
