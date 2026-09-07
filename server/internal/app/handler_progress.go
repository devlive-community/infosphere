package app

import (
	"net/http"
	"strconv"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

// SaveReadingProgress PUT /reading-progress/:bookId 记录当前用户在书籍中读到的章节
func (a *App) SaveReadingProgress(c *gin.Context) {
	u := currentUser(c)
	bookID, err := strconv.Atoi(c.Param("bookId"))
	if err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	var req struct {
		DocID    uint   `json:"doc_id"`
		DocSlug  string `json:"doc_slug"`
		DocTitle string `json:"doc_title"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.DocID == 0 || req.DocSlug == "" {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}

	// 书籍必须存在；私密书籍校验可见性
	var book models.Book
	if err := a.DB.First(&book, bookID).Error; err != nil {
		fail(c, http.StatusNotFound, "书籍不存在")
		return
	}
	if !a.canReadBook(u, &book) {
		fail(c, http.StatusNotFound, "书籍不存在")
		return
	}
	var doc models.Document
	if err := a.DB.Where("id = ? AND book_id = ?", req.DocID, book.ID).First(&doc).Error; err != nil || !a.canReadDocument(u, &doc, &book) {
		fail(c, http.StatusNotFound, "章节不存在")
		return
	}

	progress := models.ReadingProgress{
		UserID:   u.ID,
		BookID:   book.ID,
		DocID:    req.DocID,
		DocSlug:  doc.Slug,
		DocTitle: doc.Title,
	}
	// upsert：每用户每书一条
	if err := a.DB.Where("user_id = ? AND book_id = ?", u.ID, book.ID).
		Assign(progress).FirstOrCreate(&progress).Error; err != nil {
		fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
		return
	}
	a.DB.Model(&progress).Updates(map[string]any{"doc_id": doc.ID, "doc_slug": doc.Slug, "doc_title": doc.Title})

	// 记录该章节已读（每用户每章一条，重复读不重复插入）
	read := models.ReadChapter{UserID: u.ID, BookID: book.ID, DocID: doc.ID}
	a.DB.Where("user_id = ? AND doc_id = ?", u.ID, doc.ID).FirstOrCreate(&read)

	ok(c, progress)
}

// ReadChapters GET /books/:id/read-chapters 当前用户在该书籍已读的章节 ID 列表
func (a *App) ReadChapters(c *gin.Context) {
	u := currentUser(c)
	bookID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	var book models.Book
	if err := a.DB.First(&book, bookID).Error; err != nil || !a.canReadBook(u, &book) {
		fail(c, http.StatusNotFound, "书籍不存在")
		return
	}
	docIDs := []uint{}
	a.DB.Model(&models.ReadChapter{}).Where("user_id = ? AND book_id = ?", u.ID, book.ID).Pluck("doc_id", &docIDs)
	ok(c, gin.H{"doc_ids": docIDs})
}

// GetReadingProgress GET /reading-progress/:bookId 当前用户在该书籍的进度
func (a *App) GetReadingProgress(c *gin.Context) {
	u := currentUser(c)
	bookID, err := strconv.Atoi(c.Param("bookId"))
	if err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	var book models.Book
	if err := a.DB.First(&book, bookID).Error; err != nil || !a.canReadBook(u, &book) {
		fail(c, http.StatusNotFound, "书籍不存在")
		return
	}
	var progress models.ReadingProgress
	if err := a.DB.Where("user_id = ? AND book_id = ?", u.ID, bookID).First(&progress).Error; err != nil {
		ok(c, nil) // 无进度返回 null
		return
	}
	ok(c, progress)
}
