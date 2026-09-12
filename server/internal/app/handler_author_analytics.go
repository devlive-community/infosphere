package app

import (
	"math"
	"net/http"
	"time"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

// authorBookRow 作者仪表盘中单本书的对比指标。
type authorBookRow struct {
	ID                uint      `json:"id"`
	Title             string    `json:"title"`
	Slug              string    `json:"slug"`
	Status            string    `json:"status"`
	IsPublic          bool      `json:"is_public"`
	LifetimeViews     int       `json:"lifetime_views"`
	PeriodViews       int64     `json:"period_views"`
	PreviousViews     int64     `json:"previous_views"`
	GrowthPercent     *float64  `json:"growth_percent"`
	Chapters          int64     `json:"chapters"`
	RegisteredReaders int64     `json:"registered_readers"`
	CompletedReaders  int64     `json:"completed_readers"`
	CompletionRate    float64   `json:"completion_rate"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// authorAnalyticsResult 作者仪表盘：本人全部书籍的横向对比 + 周期环比汇总。
type authorAnalyticsResult struct {
	Days               int             `json:"days"`
	TotalBooks         int             `json:"total_books"`
	PublishedBooks     int             `json:"published_books"`
	TotalLifetimeViews int64           `json:"total_lifetime_views"`
	TotalPeriodViews   int64           `json:"total_period_views"`
	TotalPreviousViews int64           `json:"total_previous_views"`
	TotalGrowthPercent *float64        `json:"total_growth_percent"`
	TotalReaders       int64           `json:"total_readers"`
	Books              []authorBookRow `json:"books"`
}

// growthPercent 计算周期环比增幅（百分比，一位小数）；上期为 0 时无法比较返回 nil。
func growthPercent(period, previous int64) *float64 {
	if previous <= 0 {
		return nil
	}
	value := math.Round(((float64(period-previous)/float64(previous))*100)*10) / 10
	return &value
}

// MyAuthorAnalytics GET /users/me/author-analytics 汇总本人全部书籍的对比指标（多书对比 + 周期环比）。
func (a *App) MyAuthorAnalytics(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		fail(c, http.StatusUnauthorized, "请先登录")
		return
	}
	days := atoiDefault(c.Query("days"), 30)
	if days != 7 && days != 30 && days != 90 && days != 180 {
		fail(c, http.StatusBadRequest, "统计周期仅支持 7、30、90 或 180 天")
		return
	}

	today := analyticsDayStart(currentTime())
	start := today.AddDate(0, 0, -(days - 1))
	previousStart := start.AddDate(0, 0, -days)
	startDay := start.Format("2006-01-02")
	nextDay := today.AddDate(0, 0, 1).Format("2006-01-02")
	previousStartDay := previousStart.Format("2006-01-02")

	// 仅本人拥有的书籍（不含协作），按累计浏览量排序便于对比。
	books := []models.Book{}
	if err := a.DB.Where("user_id = ?", user.ID).Order("view_count DESC, id ASC").Find(&books).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询书籍失败")
		return
	}
	if len(books) == 0 {
		ok(c, authorAnalyticsResult{Days: days, Books: []authorBookRow{}})
		return
	}

	bookIDs := make([]uint, 0, len(books))
	for _, b := range books {
		bookIDs = append(bookIDs, b.ID)
	}

	// 各书本周期 / 上期浏览量（按 book_id 分组，一次查询覆盖全部书）。
	type viewRow struct {
		BookID uint
		Views  int64
	}
	periodByBook := map[uint]int64{}
	previousByBook := map[uint]int64{}
	periodRows := []viewRow{}
	if err := a.DB.Model(&models.BookAnalyticsDaily{}).
		Select("book_id, SUM(view_count) AS views").
		Where("book_id IN ? AND day >= ? AND day < ?", bookIDs, startDay, nextDay).
		Group("book_id").Scan(&periodRows).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询分析数据失败")
		return
	}
	for _, r := range periodRows {
		periodByBook[r.BookID] = r.Views
	}
	previousRows := []viewRow{}
	if err := a.DB.Model(&models.BookAnalyticsDaily{}).
		Select("book_id, SUM(view_count) AS views").
		Where("book_id IN ? AND day >= ? AND day < ?", bookIDs, previousStartDay, startDay).
		Group("book_id").Scan(&previousRows).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询分析数据失败")
		return
	}
	for _, r := range previousRows {
		previousByBook[r.BookID] = r.Views
	}

	// 各书已发布章节数。
	type countRow struct {
		BookID uint
		Count  int64
	}
	publishedByBook := map[uint]int64{}
	publishedRows := []countRow{}
	if err := a.DB.Model(&models.Document{}).
		Select("book_id, COUNT(*) AS count").
		Where("book_id IN ? AND deleted_at IS NULL AND status = ?", bookIDs, "published").
		Group("book_id").Scan(&publishedRows).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询章节数据失败")
		return
	}
	for _, r := range publishedRows {
		publishedByBook[r.BookID] = r.Count
	}

	// 各书注册读者数（有阅读进度记录的去重用户）。
	registeredByBook := map[uint]int64{}
	registeredRows := []countRow{}
	if err := a.DB.Model(&models.ReadingProgress{}).
		Select("book_id, COUNT(*) AS count").
		Where("book_id IN ?", bookIDs).
		Group("book_id").Scan(&registeredRows).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询阅读数据失败")
		return
	}
	for _, r := range registeredRows {
		registeredByBook[r.BookID] = r.Count
	}

	// 各书读完读者数：读过的已发布章节数 ≥ 该书已发布章节总数的去重用户。
	completedByBook := map[uint]int64{}
	completedRows := []countRow{}
	if err := a.DB.Raw(`SELECT t.book_id AS book_id, COUNT(*) AS count FROM (
		SELECT rc.book_id AS book_id, rc.user_id AS user_id, COUNT(DISTINCT rc.doc_id) AS read_count
		FROM read_chapters rc
		JOIN documents d ON d.id = rc.doc_id AND d.deleted_at IS NULL AND d.status = ?
		WHERE rc.book_id IN ?
		GROUP BY rc.book_id, rc.user_id
	) t JOIN (
		SELECT book_id, COUNT(*) AS pub FROM documents
		WHERE book_id IN ? AND deleted_at IS NULL AND status = ?
		GROUP BY book_id
	) p ON p.book_id = t.book_id
	WHERE t.read_count >= p.pub
	GROUP BY t.book_id`, "published", bookIDs, bookIDs, "published").
		Scan(&completedRows).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询阅读数据失败")
		return
	}
	for _, r := range completedRows {
		completedByBook[r.BookID] = r.Count
	}

	rows := make([]authorBookRow, 0, len(books))
	var totalLifetime, totalPeriod, totalPrevious, totalReaders int64
	publishedBooks := 0
	for _, b := range books {
		period := periodByBook[b.ID]
		previous := previousByBook[b.ID]
		registered := registeredByBook[b.ID]
		completed := completedByBook[b.ID]
		completionRate := 0.0
		if registered > 0 {
			completionRate = math.Round((float64(completed)/float64(registered)*100)*10) / 10
		}
		rows = append(rows, authorBookRow{
			ID: b.ID, Title: b.Title, Slug: b.Slug, Status: b.Status, IsPublic: b.IsPublic,
			LifetimeViews: b.ViewCount, PeriodViews: period, PreviousViews: previous,
			GrowthPercent: growthPercent(period, previous),
			Chapters:      publishedByBook[b.ID], RegisteredReaders: registered,
			CompletedReaders: completed, CompletionRate: completionRate, UpdatedAt: b.UpdatedAt,
		})
		totalLifetime += int64(b.ViewCount)
		totalPeriod += period
		totalPrevious += previous
		totalReaders += registered
		if b.Status == "published" || b.Status == "completed" {
			publishedBooks++
		}
	}

	ok(c, authorAnalyticsResult{
		Days: days, TotalBooks: len(books), PublishedBooks: publishedBooks,
		TotalLifetimeViews: totalLifetime, TotalPeriodViews: totalPeriod,
		TotalPreviousViews: totalPrevious, TotalGrowthPercent: growthPercent(totalPeriod, totalPrevious),
		TotalReaders: totalReaders, Books: rows,
	})
}
