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

// MyReading GET /users/me/reading 当前用户「我在读」列表：跨书聚合进度，按最近阅读倒序分页。
func (a *App) MyReading(c *gin.Context) {
	u := currentUser(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	pageSize := 9
	if p := atoiDefault(c.Query("page_size"), 9); p > 0 && p <= 50 {
		pageSize = p
	}

	var total int64
	a.DB.Model(&models.ReadingProgress{}).Where("user_id = ?", u.ID).Count(&total)

	var progresses []models.ReadingProgress
	if err := a.DB.Where("user_id = ?", u.ID).
		Order("updated_at DESC").
		Limit(pageSize).Offset((page - 1) * pageSize).
		Find(&progresses).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询失败")
		return
	}

	bookIDs := make([]uint, 0, len(progresses))
	for _, p := range progresses {
		bookIDs = append(bookIDs, p.BookID)
	}

	// 批量取书（含作者、标签、章节数），避免逐条查询
	books := map[uint]models.Book{}
	if len(bookIDs) > 0 {
		var list []models.Book
		a.DB.Preload("User").Preload("Tags").Where("id IN ?", bookIDs).Find(&list)
		a.attachChapterCounts(list)
		for _, b := range list {
			books[b.ID] = b
		}
	}

	// 批量取每书已读章节数
	type readRow struct {
		BookID uint
		Cnt    int
	}
	readCounts := map[uint]int{}
	if len(bookIDs) > 0 {
		var rows []readRow
		a.DB.Model(&models.ReadChapter{}).
			Select("book_id, COUNT(*) as cnt").
			Where("user_id = ? AND book_id IN ?", u.ID, bookIDs).
			Group("book_id").Scan(&rows)
		for _, r := range rows {
			readCounts[r.BookID] = r.Cnt
		}
	}

	items := make([]gin.H, 0, len(progresses))
	for _, p := range progresses {
		book, exists := books[p.BookID]
		if !exists {
			continue // 书籍已删除，跳过该进度
		}
		totalCh := book.ChapterCount
		readCnt := readCounts[p.BookID]
		if readCnt > totalCh {
			readCnt = totalCh
		}
		pct := 0
		if totalCh > 0 {
			pct = (readCnt*100 + totalCh/2) / totalCh // 四舍五入到整数百分比
		}
		items = append(items, gin.H{
			"book":           book,
			"read_count":     readCnt,
			"total_chapters": totalCh,
			"percentage":     pct,
			"last_doc_slug":  p.DocSlug,
			"last_doc_title": p.DocTitle,
			"last_read_at":   p.UpdatedAt,
		})
	}
	ok(c, gin.H{"items": items, "total": total, "page": page, "page_size": pageSize})
}
