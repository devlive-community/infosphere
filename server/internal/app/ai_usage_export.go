package app

import (
	"encoding/csv"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"knowforge/server/internal/models"
)

// AI 用量导出（CSV，UTF-8 带 BOM 便于表格软件打开）：用户导出自己的调用记录（不含费用与原始报错），
// 管理员按筛选条件导出调用明细（含用户、费用与错误信息）。逐行写出，不一次性加载到内存。

func writeCSVHeaders(c *gin.Context, filename string) *csv.Writer {
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	_, _ = c.Writer.Write([]byte("\xEF\xBB\xBF"))
	return csv.NewWriter(c.Writer)
}

func eachUsageRow(q *gorm.DB, fn func(r *models.AIUsageLog)) error {
	rows, err := q.Order("id ASC").Rows()
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var r models.AIUsageLog
		if q.ScanRows(rows, &r) == nil {
			fn(&r)
		}
	}
	return nil
}

func fmtTime(t time.Time) string { return t.Local().Format("2006-01-02 15:04:05") }

// ExportMyAIUsage GET /users/me/ai-usage/export?feature= 导出我的全部 AI 调用记录。
func (a *App) ExportMyAIUsage(c *gin.Context) {
	u := currentUser(c)
	q := a.DB.Model(&models.AIUsageLog{}).Where("user_id = ?", u.ID)
	if f := strings.TrimSpace(c.Query("feature")); f != "" {
		q = q.Where("feature = ?", f)
	}
	w := writeCSVHeaders(c, "my-ai-usage-"+time.Now().Format("20060102")+".csv")
	_ = w.Write([]string{"time", "trace_id", "feature", "kind", "model", "input_tokens", "output_tokens", "characters", "estimated", "duration_ms", "status"})
	_ = eachUsageRow(q, func(r *models.AIUsageLog) {
		_ = w.Write([]string{fmtTime(r.CreatedAt), r.TraceID, r.Feature, r.Kind, r.Model, strconv.FormatInt(r.InputTokens, 10), strconv.FormatInt(r.OutputTokens, 10),
			strconv.FormatInt(r.Characters, 10), strconv.FormatBool(r.Estimated), strconv.FormatInt(r.DurationMs, 10), r.Status})
	})
	w.Flush()
}

// AdminExportAIUsage GET /admin/ai/usage/export?days=&feature=&status=&user=&trace_id= 按筛选导出调用明细。
func (a *App) AdminExportAIUsage(c *gin.Context) {
	q := a.DB.Model(&models.AIUsageLog{})
	if days := atoiDefault(c.Query("days"), 0); days > 0 {
		q = q.Where("created_at >= ?", dayStart(time.Now()).AddDate(0, 0, -(days-1)))
	}
	if f := strings.TrimSpace(c.Query("feature")); f != "" {
		q = q.Where("feature = ?", f)
	}
	if s := c.Query("status"); s == "ok" || s == "error" {
		q = q.Where("status = ?", s)
	}
	if tr := strings.TrimSpace(c.Query("trace_id")); tr != "" {
		q = q.Where("trace_id = ?", tr)
	}
	if name := strings.TrimSpace(c.Query("user")); name != "" {
		var u models.User
		if a.DB.Select("id").Where("username = ?", name).First(&u).Error != nil {
			q = q.Where("1 = 0")
		} else {
			q = q.Where("user_id = ?", u.ID)
		}
	}
	names := map[uint]string{}
	var users []models.User
	a.DB.Select("id, username").Where("id IN (?)", a.DB.Model(&models.AIUsageLog{}).Distinct("user_id")).Find(&users)
	for _, u := range users {
		names[u.ID] = u.Username
	}
	w := writeCSVHeaders(c, "ai-usage-"+time.Now().Format("20060102")+".csv")
	_ = w.Write([]string{"time", "user", "trace_id", "feature", "ref_type", "ref_id", "kind", "provider", "model", "input_tokens", "output_tokens",
		"characters", "estimated", "cost", "currency", "duration_ms", "status", "error"})
	_ = eachUsageRow(q, func(r *models.AIUsageLog) {
		_ = w.Write([]string{fmtTime(r.CreatedAt), names[r.UserID], r.TraceID, r.Feature, r.RefType, strconv.FormatUint(uint64(r.RefID), 10), r.Kind, r.Provider, r.Model,
			strconv.FormatInt(r.InputTokens, 10), strconv.FormatInt(r.OutputTokens, 10), strconv.FormatInt(r.Characters, 10), strconv.FormatBool(r.Estimated),
			strconv.FormatFloat(float64(r.CostMicros)/1_000_000, 'f', 6, 64), r.Currency, strconv.FormatInt(r.DurationMs, 10), r.Status, r.Error})
	})
	w.Flush()
}
