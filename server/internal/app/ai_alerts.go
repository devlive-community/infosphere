package app

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm/clause"

	"knowforge/server/internal/i18ntext"
	"knowforge/server/internal/models"
)

// AI 用量预警：只报警、不限流（AI 调用不设上限，由预警帮助管理员及早发现异常，如 Agent 原地打转、单个用户异常消耗）。
// 每次调用记账后检查三类阈值（0 为关闭）：全站当日估算费用、单个用户当日 tokens、单条调用链 tokens。
// 超过时写入 ai_alerts（类型 + 对象唯一，同一对象只报一次）并通知全部管理员。

const (
	alertSiteDailyCost   = "site_daily_cost"
	alertUserDailyTokens = "user_daily_tokens"
	alertTraceTokens     = "trace_tokens"

	cfgAlertDailyCost       = "ai_alert_daily_cost"        // 货币单位（小数）
	cfgAlertUserDailyTokens = "ai_alert_user_daily_tokens" // tokens
	cfgAlertTraceTokens     = "ai_alert_trace_tokens"      // tokens
)

func init() {
	i18ntext.Register("notify.ai.alertSiteDailyCost", map[string]string{"zh-CN": "AI 用量预警：今日估算费用已达 {value}（阈值 {threshold}）", "en": "AI usage alert: today's estimated cost reached {value} (threshold {threshold})"})
	i18ntext.Register("notify.ai.alertUserDailyTokens", map[string]string{"zh-CN": "AI 用量预警：用户 {user} 今日已用 {value} tokens（阈值 {threshold}）", "en": "AI usage alert: user {user} used {value} tokens today (threshold {threshold})"})
	i18ntext.Register("notify.ai.alertTraceTokens", map[string]string{"zh-CN": "AI 用量预警：一条调用链已消耗 {value} tokens（阈值 {threshold}），可能在反复调用", "en": "AI usage alert: one call chain has used {value} tokens (threshold {threshold}) and may be looping"})
}

type aiAlertSettings struct {
	DailyCostMicros int64
	UserDailyTokens int64
	TraceTokens     int64
}

func (a *App) aiAlertSettings() aiAlertSettings {
	num := func(key string) int64 {
		v, err := strconv.ParseInt(strings.TrimSpace(a.getSetting(key)), 10, 64)
		if err != nil || v < 0 {
			return 0
		}
		return v
	}
	cost, err := strconv.ParseFloat(strings.TrimSpace(a.getSetting(cfgAlertDailyCost)), 64)
	if err != nil || cost < 0 || math.IsNaN(cost) || math.IsInf(cost, 0) {
		cost = 0
	}
	return aiAlertSettings{DailyCostMicros: int64(math.Round(cost * 1_000_000)), UserDailyTokens: num(cfgAlertUserDailyTokens), TraceTokens: num(cfgAlertTraceTokens)}
}

func dayStart(now time.Time) time.Time {
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
}

// checkAIAlerts 调用记账后检查预警阈值。
func (a *App) checkAIAlerts(row *models.AIUsageLog) {
	s := a.aiAlertSettings()
	if row.Status != "ok" || (s.DailyCostMicros == 0 && s.UserDailyTokens == 0 && s.TraceTokens == 0) {
		return
	}
	now := time.Now()
	today := dayStart(now)
	date := today.Format("2006-01-02")
	sum := func(expr string, where string, args ...any) int64 {
		var out struct{ N int64 }
		a.DB.Model(&models.AIUsageLog{}).Select("COALESCE(SUM("+expr+"), 0) AS n").Where("status = ? AND "+where, append([]any{"ok"}, args...)...).Scan(&out)
		return out.N
	}
	if s.TraceTokens > 0 && row.TraceID != "" {
		if v := sum("input_tokens + output_tokens", "trace_id = ?", row.TraceID); v >= s.TraceTokens {
			a.raiseAIAlert(models.AIAlert{Kind: alertTraceTokens, Key: row.TraceID, UserID: row.UserID, TraceID: row.TraceID, Feature: row.Feature, Value: v, Threshold: s.TraceTokens})
		}
	}
	if s.UserDailyTokens > 0 && row.UserID != 0 {
		if v := sum("input_tokens + output_tokens", "user_id = ? AND created_at >= ?", row.UserID, today); v >= s.UserDailyTokens {
			a.raiseAIAlert(models.AIAlert{Kind: alertUserDailyTokens, Key: fmt.Sprintf("%d:%s", row.UserID, date), UserID: row.UserID, Value: v, Threshold: s.UserDailyTokens})
		}
	}
	if s.DailyCostMicros > 0 {
		if v := sum("cost_micros", "created_at >= ?", today); v >= s.DailyCostMicros {
			a.raiseAIAlert(models.AIAlert{Kind: alertSiteDailyCost, Key: date, Value: v, Threshold: s.DailyCostMicros, Currency: a.aiPricing().Currency})
		}
	}
}

// raiseAIAlert 写入预警（已存在则忽略）；首次写入时通知全部管理员。
func (a *App) raiseAIAlert(alert models.AIAlert) {
	res := a.DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&alert)
	if res.Error != nil || res.RowsAffected == 0 {
		return
	}
	params := map[string]string{"value": strconv.FormatInt(alert.Value, 10), "threshold": strconv.FormatInt(alert.Threshold, 10)}
	link := "/admin/ai-usage"
	key := "notify.ai.alertTraceTokens"
	switch alert.Kind {
	case alertSiteDailyCost:
		key = "notify.ai.alertSiteDailyCost"
		params["value"], params["threshold"] = formatMicros(alert.Value, alert.Currency), formatMicros(alert.Threshold, alert.Currency)
	case alertUserDailyTokens:
		key = "notify.ai.alertUserDailyTokens"
		var u models.User
		a.DB.Select("username").First(&u, alert.UserID)
		params["user"] = u.Username
		link += "?user=" + u.Username
	default:
		link += "?trace=" + alert.TraceID
	}
	var admins []uint
	a.DB.Model(&models.User{}).Where("role = ? AND is_active = ?", "admin", true).Pluck("id", &admins)
	for _, id := range admins {
		a.NotifyI18n(id, "system", key, params, map[string]any{"link": link})
	}
}

func formatMicros(micros int64, currency string) string {
	return fmt.Sprintf("%.2f %s", float64(micros)/1_000_000, currency)
}

// AdminAIAlerts GET /admin/ai/alerts?page= 最近的用量预警。
func (a *App) AdminAIAlerts(c *gin.Context) {
	page, pageSize := paginate(c)
	var total int64
	a.DB.Model(&models.AIAlert{}).Count(&total)
	var rows []models.AIAlert
	a.DB.Order("id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&rows)
	names := map[uint]string{}
	ids := []uint{}
	for _, r := range rows {
		if r.UserID > 0 {
			ids = append(ids, r.UserID)
		}
	}
	if len(ids) > 0 {
		var users []models.User
		a.DB.Select("id, username").Where("id IN ?", ids).Find(&users)
		for _, u := range users {
			names[u.ID] = u.Username
		}
	}
	items := make([]gin.H, 0, len(rows))
	for _, r := range rows {
		items = append(items, gin.H{"alert": r, "username": names[r.UserID]})
	}
	ok(c, PageResult{Items: items, Total: total, Page: page, PageSize: pageSize})
}
