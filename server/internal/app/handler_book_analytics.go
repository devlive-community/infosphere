package app

import (
	"math"
	"net/http"
	"net/url"
	"strings"
	"time"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const bookAnalyticsRetentionDays = 180

type analyticsTrendPoint struct {
	Date  string `json:"date"`
	Views int64  `json:"views"`
}

type analyticsChapter struct {
	ID        uint   `json:"id"`
	Title     string `json:"title"`
	Slug      string `json:"slug"`
	ViewCount int64  `json:"view_count"`
}

type analyticsSource struct {
	Source     string  `json:"source"`
	ViewCount  int64   `json:"view_count"`
	Percentage float64 `json:"percentage"`
}

// analyticsChapterReach 章节到达漏斗：按章节顺序统计读过该章的去重读者数。
type analyticsChapterReach struct {
	ID        uint   `json:"id"`
	Title     string `json:"title"`
	Slug      string `json:"slug"`
	SortOrder int    `json:"sort_order"`
	Readers   int64  `json:"readers"`
}

type bookAnalyticsResult struct {
	Days              int                   `json:"days"`
	RetentionDays     int                   `json:"retention_days"`
	LifetimeViews     int                   `json:"lifetime_views"`
	PeriodViews       int64                 `json:"period_views"`
	PreviousViews     int64                 `json:"previous_views"`
	GrowthPercent     *float64              `json:"growth_percent"`
	RegisteredReaders int64                 `json:"registered_readers"`
	CompletedReaders  int64                 `json:"completed_readers"`
	CompletionRate    float64               `json:"completion_rate"`
	Trend             []analyticsTrendPoint   `json:"trend"`
	PopularChapters   []analyticsChapter      `json:"popular_chapters"`
	Sources           []analyticsSource       `json:"sources"`
	ChapterFunnel     []analyticsChapterReach `json:"chapter_funnel"`
}

// GetBookAnalytics GET /books/:id/analytics 聚合书籍访问分析，仅 owner/admin 可见。
func (a *App) GetBookAnalytics(c *gin.Context) {
	book, status := a.findBook(c)
	if book == nil {
		fail(c, status, "书籍不存在")
		return
	}
	if !a.canManageBook(currentUser(c), book) {
		fail(c, http.StatusNotFound, "书籍不存在")
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
	startDay, nextDay := start.Format("2006-01-02"), today.AddDate(0, 0, 1).Format("2006-01-02")

	type trendRow struct {
		Day   string
		Views int64
	}
	rows := []trendRow{}
	if err := a.DB.Model(&models.BookAnalyticsDaily{}).
		Select("day, SUM(view_count) AS views").
		Where("book_id = ? AND day >= ? AND day < ?", book.ID, startDay, nextDay).
		Group("day").Order("day ASC").Scan(&rows).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询分析数据失败")
		return
	}
	viewsByDay := make(map[string]int64, len(rows))
	for _, row := range rows {
		viewsByDay[row.Day] = row.Views
	}
	trend := make([]analyticsTrendPoint, 0, days)
	var periodViews int64
	for offset := 0; offset < days; offset++ {
		day := start.AddDate(0, 0, offset).Format("2006-01-02")
		views := viewsByDay[day]
		periodViews += views
		trend = append(trend, analyticsTrendPoint{Date: day, Views: views})
	}

	var previousViews int64
	if err := a.DB.Model(&models.BookAnalyticsDaily{}).
		Where("book_id = ? AND day >= ? AND day < ?", book.ID, previousStart.Format("2006-01-02"), startDay).
		Select("COALESCE(SUM(view_count), 0)").Scan(&previousViews).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询分析数据失败")
		return
	}
	var growth *float64
	if previousViews > 0 {
		value := math.Round(((float64(periodViews-previousViews)/float64(previousViews))*100)*10) / 10
		growth = &value
	}

	popular := []analyticsChapter{}
	if err := a.DB.Model(&models.BookAnalyticsDaily{}).
		Select("documents.id, documents.title, documents.slug, SUM(book_analytics_dailies.view_count) AS view_count").
		Joins("JOIN documents ON documents.id = book_analytics_dailies.document_id").
		Where("book_analytics_dailies.book_id = ? AND book_analytics_dailies.day >= ? AND book_analytics_dailies.day < ? AND documents.deleted_at IS NULL", book.ID, startDay, nextDay).
		Group("documents.id, documents.title, documents.slug").Order("view_count DESC").Limit(8).Scan(&popular).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询热门章节失败")
		return
	}

	type sourceRow struct {
		Source string
		Views  int64
	}
	sourceRows := []sourceRow{}
	if err := a.DB.Model(&models.BookAnalyticsDaily{}).
		Select("source, SUM(view_count) AS views").
		Where("book_id = ? AND day >= ? AND day < ?", book.ID, startDay, nextDay).
		Group("source").Order("views DESC").Scan(&sourceRows).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询访问来源失败")
		return
	}
	sources := make([]analyticsSource, 0, len(sourceRows))
	for _, row := range sourceRows {
		percentage := 0.0
		if periodViews > 0 {
			percentage = math.Round((float64(row.Views)/float64(periodViews)*100)*10) / 10
		}
		sources = append(sources, analyticsSource{Source: row.Source, ViewCount: row.Views, Percentage: percentage})
	}

	var registeredReaders, completedReaders, publishedDocuments int64
	if err := a.DB.Model(&models.ReadingProgress{}).Where("book_id = ?", book.ID).Count(&registeredReaders).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询阅读数据失败")
		return
	}
	if err := a.DB.Model(&models.Document{}).Where("book_id = ? AND status = ?", book.ID, "published").Count(&publishedDocuments).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询阅读数据失败")
		return
	}
	if publishedDocuments > 0 {
		if err := a.DB.Raw(`SELECT COUNT(*) FROM (
			SELECT rc.user_id FROM read_chapters rc
			JOIN documents d ON d.id = rc.doc_id AND d.deleted_at IS NULL AND d.status = ?
			JOIN reading_progresses rp ON rp.user_id = rc.user_id AND rp.book_id = rc.book_id
			WHERE rc.book_id = ? GROUP BY rc.user_id
			HAVING COUNT(DISTINCT rc.doc_id) >= ?
		) completed`, "published", book.ID, publishedDocuments).Scan(&completedReaders).Error; err != nil {
			fail(c, http.StatusInternalServerError, "查询阅读数据失败")
			return
		}
	}
	completionRate := 0.0
	if registeredReaders > 0 {
		completionRate = math.Round((float64(completedReaders)/float64(registeredReaders)*100)*10) / 10
	}

	// 章节到达漏斗：已发布章节按顺序，各自的去重读者数（读到哪一章、在哪流失）
	funnel := []analyticsChapterReach{}
	if err := a.DB.Model(&models.Document{}).
		Select("documents.id, documents.title, documents.slug, documents.sort_order, COUNT(DISTINCT read_chapters.user_id) AS readers").
		Joins("LEFT JOIN read_chapters ON read_chapters.doc_id = documents.id").
		Where("documents.book_id = ? AND documents.deleted_at IS NULL AND documents.status = ?", book.ID, "published").
		Group("documents.id, documents.title, documents.slug, documents.sort_order").
		Order("documents.sort_order ASC, documents.id ASC").
		Scan(&funnel).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询章节漏斗失败")
		return
	}

	ok(c, bookAnalyticsResult{
		Days: days, RetentionDays: bookAnalyticsRetentionDays, LifetimeViews: book.ViewCount,
		PeriodViews: periodViews, PreviousViews: previousViews, GrowthPercent: growth,
		RegisteredReaders: registeredReaders, CompletedReaders: completedReaders, CompletionRate: completionRate,
		Trend: trend, PopularChapters: popular, Sources: sources, ChapterFunnel: funnel,
	})
}

func analyticsDayStart(value time.Time) time.Time {
	local := value.In(time.Local)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.Local)
}

func recordAnalyticsView(tx *gorm.DB, bookID, documentID uint, source string) error {
	bucket := models.BookAnalyticsDaily{
		BookID: bookID, DocumentID: documentID, Day: analyticsDayStart(currentTime()).Format("2006-01-02"), Source: source, ViewCount: 1,
	}
	increment := "view_count + ?"
	if tx.Dialector.Name() == "postgres" {
		increment = "book_analytics_dailies.view_count + ?"
	}
	return tx.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "book_id"}, {Name: "document_id"}, {Name: "day"}, {Name: "source"}},
		DoUpdates: clause.Assignments(map[string]any{"view_count": gorm.Expr(increment, 1)}),
	}).Create(&bucket).Error
}

func analyticsReferrer(c *gin.Context) string {
	var payload struct {
		Referrer string `json:"referrer"`
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4<<10)
	_ = c.ShouldBindJSON(&payload)
	if strings.TrimSpace(payload.Referrer) != "" {
		referrer := []rune(payload.Referrer)
		return string(referrer[:min(len(referrer), 2048)])
	}
	return c.GetHeader("Referer")
}

func classifyAnalyticsSource(raw, siteHost string) string {
	if strings.TrimSpace(raw) == "" {
		return "direct"
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Hostname() == "" {
		return "direct"
	}
	host := strings.ToLower(parsed.Hostname())
	site := strings.ToLower(siteHost)
	if parsedSite, err := url.Parse("//" + siteHost); err == nil && parsedSite.Hostname() != "" {
		site = strings.ToLower(parsedSite.Hostname())
	}
	if host == site {
		return "internal"
	}
	for _, domain := range []string{"google.com", "google.com.hk", "bing.com", "baidu.com", "sogou.com", "so.com", "duckduckgo.com"} {
		if hostMatchesDomain(host, domain) {
			return "search"
		}
	}
	for _, domain := range []string{"weibo.com", "zhihu.com", "facebook.com", "twitter.com", "x.com", "linkedin.com", "reddit.com"} {
		if hostMatchesDomain(host, domain) {
			return "social"
		}
	}
	return "external"
}

func hostMatchesDomain(host, domain string) bool {
	return host == domain || strings.HasSuffix(host, "."+domain)
}

func purgeExpiredBookAnalytics(db *gorm.DB) error {
	cutoff := analyticsDayStart(currentTime()).AddDate(0, 0, -(bookAnalyticsRetentionDays - 1)).Format("2006-01-02")
	return db.Where("day < ?", cutoff).Delete(&models.BookAnalyticsDaily{}).Error
}
