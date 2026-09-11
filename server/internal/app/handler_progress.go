package app

import (
	"net/http"
	"strconv"
	"time"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
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
		// 可选：章节滚动百分比（0-100，覆盖写）与本次活跃阅读秒数（增量累加）
		ScrollPercent    *int `json:"scroll_percent"`
		ReadSecondsDelta *int `json:"read_seconds_delta"`
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

	// upsert：每用户每书一条，先确保行存在
	progress := models.ReadingProgress{UserID: u.ID, BookID: book.ID}
	if err := a.DB.Where("user_id = ? AND book_id = ?", u.ID, book.ID).
		FirstOrCreate(&progress).Error; err != nil {
		fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
		return
	}
	updates := map[string]any{"doc_id": doc.ID, "doc_slug": doc.Slug, "doc_title": doc.Title}
	if req.ScrollPercent != nil {
		sp := *req.ScrollPercent
		if sp < 0 {
			sp = 0
		} else if sp > 100 {
			sp = 100
		}
		updates["scroll_percent"] = sp
	}
	if req.ReadSecondsDelta != nil {
		d := *req.ReadSecondsDelta
		if d > 3600 {
			d = 3600 // 单次上报上限 1 小时，防止异常/刷量
		}
		if d > 0 {
			updates["read_seconds"] = gorm.Expr("read_seconds + ?", d)
		}
	}
	if err := a.DB.Model(&progress).Updates(updates).Error; err != nil {
		fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
		return
	}
	a.DB.First(&progress, progress.ID) // 回读增量后的最新值

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
			"read_seconds":   p.ReadSeconds,
		})
	}
	ok(c, gin.H{"items": items, "total": total, "page": page, "page_size": pageSize})
}

// MyReadingStats GET /users/me/reading-stats 当前用户阅读数据概览。
func (a *App) MyReadingStats(c *gin.Context) {
	u := currentUser(c)

	var readingBooks, chaptersRead, completedBooks int64
	a.DB.Model(&models.ReadingProgress{}).Where("user_id = ?", u.ID).Count(&readingBooks)
	a.DB.Model(&models.ReadChapter{}).Where("user_id = ?", u.ID).Count(&chaptersRead)

	// 读完的书：某书已读的已发布章节数 ≥ 该书已发布章节总数（复用 analytics 的完成判定思路）
	a.DB.Raw(`SELECT COUNT(*) FROM (
		SELECT rc.book_id
		FROM read_chapters rc
		JOIN documents d ON d.id = rc.doc_id AND d.deleted_at IS NULL AND d.status = ?
		WHERE rc.user_id = ?
		GROUP BY rc.book_id
		HAVING COUNT(DISTINCT rc.doc_id) >= (
			SELECT COUNT(*) FROM documents pd
			WHERE pd.book_id = rc.book_id AND pd.deleted_at IS NULL AND pd.status = ?
		)
	) completed`, "published", u.ID, "published").Scan(&completedBooks)

	// 连续阅读天数：仅当最近阅读日为今天或昨天才视为“当前连续”，再向前逐日回溯
	var readTimes []time.Time
	a.DB.Model(&models.ReadChapter{}).Where("user_id = ?", u.ID).Order("created_at DESC").Pluck("created_at", &readTimes)

	ok(c, gin.H{
		"reading_books":   readingBooks,
		"completed_books": completedBooks,
		"chapters_read":   chaptersRead,
		"streak_days":     currentReadingStreak(readTimes),
	})
}

// currentReadingStreak 从今天/昨天为起点向前统计连续有阅读记录的天数（按服务器时区取日期）。
func currentReadingStreak(times []time.Time) int {
	if len(times) == 0 {
		return 0
	}
	const layout = "2006-01-02"
	days := make(map[string]bool, len(times))
	for _, t := range times {
		days[t.Format(layout)] = true
	}
	start := analyticsDayStart(currentTime())
	if !days[start.Format(layout)] {
		start = start.AddDate(0, 0, -1) // 今天未读则允许从昨天起算
		if !days[start.Format(layout)] {
			return 0
		}
	}
	streak := 0
	for d := start; days[d.Format(layout)]; d = d.AddDate(0, 0, -1) {
		streak++
	}
	return streak
}

// ResetReadingProgress DELETE /reading-progress/:bookId 清除当前用户在该书的阅读进度与逐章已读记录。
func (a *App) ResetReadingProgress(c *gin.Context) {
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
	a.DB.Where("user_id = ? AND book_id = ?", u.ID, book.ID).Delete(&models.ReadingProgress{})
	a.DB.Where("user_id = ? AND book_id = ?", u.ID, book.ID).Delete(&models.ReadChapter{})
	ok(c, nil)
}

// MarkBookRead POST /reading-progress/:bookId/complete 将该书全部已发布章节标记为已读，进度置为最后一章。
func (a *App) MarkBookRead(c *gin.Context) {
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
	var docs []models.Document
	a.DB.Where("book_id = ? AND status = ?", book.ID, "published").
		Order("sort_order ASC, id ASC").Find(&docs)
	if len(docs) == 0 {
		fail(c, http.StatusBadRequest, "该书暂无已发布章节")
		return
	}
	for _, d := range docs {
		read := models.ReadChapter{UserID: u.ID, BookID: book.ID, DocID: d.ID}
		a.DB.Where("user_id = ? AND doc_id = ?", u.ID, d.ID).FirstOrCreate(&read)
	}
	last := docs[len(docs)-1]
	progress := models.ReadingProgress{UserID: u.ID, BookID: book.ID}
	a.DB.Where("user_id = ? AND book_id = ?", u.ID, book.ID).FirstOrCreate(&progress)
	a.DB.Model(&progress).Updates(map[string]any{"doc_id": last.ID, "doc_slug": last.Slug, "doc_title": last.Title})
	ok(c, gin.H{"read": len(docs)})
}

// readingGoalChapters 读取当前用户的每日目标章节数（无记录默认 1）。
func (a *App) readingGoalChapters(userID uint) int {
	var g models.UserReadingGoal
	if err := a.DB.Where("user_id = ?", userID).First(&g).Error; err == nil && g.DailyChapters > 0 {
		return g.DailyChapters
	}
	return 1
}

// GetReadingGoal GET /users/me/reading-goal 当前用户每日阅读目标。
func (a *App) GetReadingGoal(c *gin.Context) {
	u := currentUser(c)
	ok(c, gin.H{"daily_chapters": a.readingGoalChapters(u.ID)})
}

// SaveReadingGoal PUT /users/me/reading-goal 设置每日阅读目标（1-100 章）。
func (a *App) SaveReadingGoal(c *gin.Context) {
	u := currentUser(c)
	var req struct {
		DailyChapters int `json:"daily_chapters"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if req.DailyChapters < 1 {
		req.DailyChapters = 1
	} else if req.DailyChapters > 100 {
		req.DailyChapters = 100
	}
	goal := models.UserReadingGoal{UserID: u.ID}
	a.DB.Where("user_id = ?", u.ID).FirstOrCreate(&goal)
	if err := a.DB.Model(&goal).Update("daily_chapters", req.DailyChapters).Error; err != nil {
		fail(c, http.StatusInternalServerError, "保存失败")
		return
	}
	ok(c, gin.H{"daily_chapters": req.DailyChapters})
}

// ReadingActivity GET /users/me/reading-activity?days=N 打卡日历：近 N 天每日新读章节数与达标情况 + 连续打卡。
func (a *App) ReadingActivity(c *gin.Context) {
	u := currentUser(c)
	days := atoiDefault(c.Query("days"), 84)
	if days < 7 {
		days = 7
	} else if days > 366 {
		days = 366
	}
	goal := a.readingGoalChapters(u.ID)

	const layout = "2006-01-02"
	today := analyticsDayStart(currentTime())
	start := today.AddDate(0, 0, -(days - 1))

	var times []time.Time
	a.DB.Model(&models.ReadChapter{}).
		Where("user_id = ? AND created_at >= ?", u.ID, start).
		Pluck("created_at", &times)
	counts := make(map[string]int, len(times))
	for _, t := range times {
		counts[analyticsDayStart(t).Format(layout)]++
	}

	type dayCell struct {
		Date  string `json:"date"`
		Count int    `json:"count"`
		Met   bool   `json:"met"`
	}
	cells := make([]dayCell, 0, days)
	met := make(map[string]bool, days)
	longest, run := 0, 0
	for i := 0; i < days; i++ {
		d := start.AddDate(0, 0, i).Format(layout)
		ct := counts[d]
		isMet := ct >= goal
		cells = append(cells, dayCell{Date: d, Count: ct, Met: isMet})
		met[d] = isMet
		if isMet {
			run++
			if run > longest {
				longest = run
			}
		} else {
			run = 0
		}
	}

	// 当前连续打卡：以今天或昨天为起点向前回溯
	current := 0
	cursor := today
	if !met[cursor.Format(layout)] {
		cursor = cursor.AddDate(0, 0, -1)
	}
	for met[cursor.Format(layout)] {
		current++
		cursor = cursor.AddDate(0, 0, -1)
	}

	todayStr := today.Format(layout)
	ok(c, gin.H{
		"goal":           gin.H{"daily_chapters": goal},
		"days":           cells,
		"current_streak": current,
		"longest_streak": longest,
		"today_count":    counts[todayStr],
		"today_met":      counts[todayStr] >= goal,
	})
}
