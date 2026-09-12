package app

import (
	"math"
	"net/http"
	"time"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

// readerRetentionWeeks 留存分析的周数窗口（含当前周）。
const readerRetentionWeeks = 12

// retentionCohort 单个周队列：以「首次阅读周」分组的读者，及其在后续各周仍有阅读的人数。
type retentionCohort struct {
	Week      string `json:"week"`      // 队列起始周一（YYYY-MM-DD）
	Size      int    `json:"size"`      // 该周首次阅读的新读者数
	Retention []int  `json:"retention"` // 各周偏移仍活跃的去重读者数（偏移 0 恒等于 size）
}

// readerRetentionResult 作者维度的读者留存：按周队列的三角矩阵 + 加权聚合曲线。
type readerRetentionResult struct {
	Weeks   int               `json:"weeks"`
	Cohorts []retentionCohort `json:"cohorts"`
	Curve   []*float64        `json:"curve"` // 各周偏移的加权平均留存率（%）；无可观测队列为 null
}

// weekStart 返回所在自然周的周一 00:00（本地时区），用于按周分桶。
func weekStart(t time.Time) time.Time {
	local := t.In(time.Local)
	day := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.Local)
	offset := (int(day.Weekday()) + 6) % 7 // 周一=0 … 周日=6
	return day.AddDate(0, 0, -offset)
}

// weeksBetween 返回两个周一之间相差的整周数（四舍五入抵消夏令时误差）。
func weeksBetween(from, to time.Time) int {
	days := int(math.Round(to.Sub(from).Hours() / 24))
	return days / 7
}

// MyReaderRetention GET /users/me/reader-retention 计算本人全部书籍的读者按周留存（首次阅读周队列）。
func (a *App) MyReaderRetention(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		fail(c, http.StatusUnauthorized, "请先登录")
		return
	}

	bookIDs := []uint{}
	if err := a.DB.Model(&models.Book{}).Where("user_id = ?", user.ID).Pluck("id", &bookIDs).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询书籍失败")
		return
	}

	currentWeek := weekStart(currentTime())
	windowStart := currentWeek.AddDate(0, 0, -7*(readerRetentionWeeks-1))

	// 预置空队列骨架（从最早窗口周到当前周），即使无数据也返回稳定结构。
	cohorts := make([]retentionCohort, readerRetentionWeeks)
	for i := 0; i < readerRetentionWeeks; i++ {
		cohorts[i] = retentionCohort{
			Week:      windowStart.AddDate(0, 0, 7*i).Format("2006-01-02"),
			Retention: make([]int, readerRetentionWeeks-i),
		}
	}
	result := readerRetentionResult{Weeks: readerRetentionWeeks, Cohorts: cohorts, Curve: make([]*float64, readerRetentionWeeks)}

	if len(bookIDs) == 0 {
		ok(c, result)
		return
	}

	// 在窗口开始前已有阅读记录的读者为「老读者」，其首次阅读不在窗口内，排除出队列。
	// （避免对聚合列 MIN(created_at) 做时间扫描——部分驱动会丢失列类型返回字符串。）
	oldReaderIDs := []uint{}
	if err := a.DB.Model(&models.ReadChapter{}).
		Where("book_id IN ? AND created_at < ?", bookIDs, windowStart).
		Distinct("user_id").Pluck("user_id", &oldReaderIDs).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询读者数据失败")
		return
	}
	oldReaders := make(map[uint]bool, len(oldReaderIDs))
	for _, id := range oldReaderIDs {
		oldReaders[id] = true
	}

	// 窗口内的阅读活动（created_at 为普通列，GORM 可正常扫描为 time.Time）。
	type activityRow struct {
		UserID    uint
		CreatedAt time.Time
	}
	activityRows := []activityRow{}
	if err := a.DB.Model(&models.ReadChapter{}).
		Select("user_id, created_at").
		Where("book_id IN ? AND created_at >= ?", bookIDs, windowStart).
		Scan(&activityRows).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询阅读活动失败")
		return
	}

	// 非老读者在窗口内的最早阅读周即其首次阅读周（据此归入队列）。
	firstWeekByUser := map[uint]time.Time{}
	for _, r := range activityRows {
		if oldReaders[r.UserID] {
			continue
		}
		w := weekStart(r.CreatedAt)
		if cur, ok := firstWeekByUser[r.UserID]; !ok || w.Before(cur) {
			firstWeekByUser[r.UserID] = w
		}
	}
	cohortIndexByUser := make(map[uint]int, len(firstWeekByUser))
	for uid, fw := range firstWeekByUser {
		idx := weeksBetween(windowStart, fw)
		if idx >= 0 && idx < readerRetentionWeeks {
			cohortIndexByUser[uid] = idx
		}
	}
	// retentionSets[队列索引][周偏移] = 去重读者集合
	retentionSets := make([]map[int]map[uint]bool, readerRetentionWeeks)
	for i := range retentionSets {
		retentionSets[i] = map[int]map[uint]bool{}
	}
	for _, r := range activityRows {
		idx, present := cohortIndexByUser[r.UserID]
		if !present {
			continue
		}
		offset := weeksBetween(firstWeekByUser[r.UserID], weekStart(r.CreatedAt))
		if offset < 0 || offset >= readerRetentionWeeks-idx {
			continue
		}
		set := retentionSets[idx][offset]
		if set == nil {
			set = map[uint]bool{}
			retentionSets[idx][offset] = set
		}
		set[r.UserID] = true
	}

	for idx := range cohorts {
		for offset := 0; offset < len(cohorts[idx].Retention); offset++ {
			cohorts[idx].Retention[offset] = len(retentionSets[idx][offset])
		}
		cohorts[idx].Size = cohorts[idx].Retention[0]
	}

	// 加权聚合曲线：仅计入该偏移可观测的队列（idx+offset < weeks）。
	for offset := 0; offset < readerRetentionWeeks; offset++ {
		var retained, base int
		for idx := 0; idx+offset < readerRetentionWeeks; idx++ {
			if cohorts[idx].Size == 0 {
				continue
			}
			base += cohorts[idx].Size
			retained += cohorts[idx].Retention[offset]
		}
		if base > 0 {
			value := math.Round((float64(retained)/float64(base)*100)*10) / 10
			result.Curve[offset] = &value
		}
	}

	ok(c, result)
}
