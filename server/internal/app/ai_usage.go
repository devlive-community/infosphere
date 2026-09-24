package app

import (
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"knowforge/server/internal/ai"
	"knowforge/server/internal/models"
	"knowforge/server/internal/plugincore"
)

// AI 用量：每次经站点 AI 服务的调用都记录调用方、功能、模型、tokens、耗时与估算费用（按调用时的单价）。
// 每月 AI 用量（tokens）是一项权益：基础值默认不限，成长等级与会员方案可设额度；超出后本月内调用被拒绝（ai.ErrQuotaExceeded）。

const (
	entAIMonthlyTokens    = "ai.monthly_tokens"
	cfgAIMonthlyTokens    = "ai_monthly_tokens"
	maxAIMonthlyTokens    = 1_000_000_000
	defaultAIUsageDays    = 30
	defaultAIUsageTopUser = 10
)

func init() {
	plugincore.RegisterEntitlement(plugincore.EntitlementDef{
		Key: entAIMonthlyTokens, Kind: plugincore.EntitlementLimit, Unit: "tokens", Min: 0, Max: maxAIMonthlyTokens, AllowUnlimited: true, Order: 40,
		Available: func(core plugincore.Core) bool { chat, embed := core.AIStatus(); return chat || embed },
		Base: func(core plugincore.Core) int64 {
			return settingLimit(core, cfgAIMonthlyTokens, plugincore.Unlimited)
		},
		SetBase: func(core plugincore.Core, v int64) error {
			return core.SetSetting(cfgAIMonthlyTokens, strconv.FormatInt(v, 10), "权益：每月 AI 用量 tokens（基础）")
		},
	})
}

// aiPricing 每百万 tokens 的单价（货币单位），未配置为 0（不估算费用）。
type aiPricing struct {
	Currency             string
	Input, Output, Embed float64
}

func (a *App) aiPricing() aiPricing {
	num := func(key string) float64 {
		v, err := strconv.ParseFloat(strings.TrimSpace(a.getSetting(key)), 64)
		if err != nil || v < 0 || math.IsNaN(v) || math.IsInf(v, 0) {
			return 0
		}
		return v
	}
	cur := strings.ToUpper(strings.TrimSpace(a.getSetting("ai_price_currency")))
	if cur == "" {
		cur = "USD"
	}
	return aiPricing{Currency: cur, Input: num("ai_price_input"), Output: num("ai_price_output"), Embed: num("ai_price_embed")}
}

// costMicros 估算费用（货币单位的百万分之一）：tokens × 每百万单价 / 1e6 × 1e6。
func (p aiPricing) costMicros(kind string, u ai.Usage) int64 {
	if kind == "embed" {
		return int64(math.Round(float64(u.InputTokens) * p.Embed))
	}
	return int64(math.Round(float64(u.InputTokens)*p.Input + float64(u.OutputTokens)*p.Output))
}

func monthStart(now time.Time) time.Time {
	return time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
}

// aiMonthUsed 用户本月已用 tokens（仅成功的调用）。
func (a *App) aiMonthUsed(userID uint) int64 {
	var total struct{ N int64 }
	a.DB.Model(&models.AIUsageLog{}).Select("COALESCE(SUM(input_tokens + output_tokens), 0) AS n").
		Where("user_id = ? AND status = ? AND created_at >= ?", userID, "ok", monthStart(time.Now())).Scan(&total)
	return total.N
}

// checkAIQuota 调用前按调用方的每月额度判定（系统调用与管理员不受限）。
func (a *App) checkAIQuota(caller ai.Caller) error {
	if caller.UserID == 0 {
		return nil
	}
	var u models.User
	if a.DB.First(&u, caller.UserID).Error != nil {
		return nil
	}
	limit := a.entitlement(&u, entAIMonthlyTokens)
	if limit == plugincore.Unlimited {
		return nil
	}
	if a.aiMonthUsed(u.ID) >= limit {
		return ai.ErrQuotaExceeded
	}
	return nil
}

// recordAIUsage 写入一条用量记录（失败的调用也记录，便于排查；tokens 为 0）。
func (a *App) recordAIUsage(caller ai.Caller, kind, provider, model string, usage ai.Usage, elapsed time.Duration, callErr error) {
	pricing := a.aiPricing()
	row := models.AIUsageLog{
		UserID: caller.UserID, Feature: caller.Feature, RefType: caller.RefType, RefID: caller.RefID,
		Kind: kind, Provider: provider, Model: truncateRunes(model, 100), DurationMs: elapsed.Milliseconds(),
		Currency: pricing.Currency, Status: "ok",
	}
	if row.Feature == "" {
		row.Feature = "other"
	}
	if callErr != nil {
		row.Status, row.Error = "error", truncateRunes(callErr.Error(), 300)
	} else {
		row.InputTokens, row.OutputTokens, row.Estimated = usage.InputTokens, usage.OutputTokens, usage.Estimated
		row.CostMicros = pricing.costMicros(kind, usage)
	}
	_ = a.DB.Create(&row).Error
}

func truncateRunes(s string, n int) string {
	if r := []rune(s); len(r) > n {
		return string(r[:n])
	}
	return s
}

// —— 用户 ——

// MyAIUsage GET /users/me/ai-usage 本月 AI 用量、额度（-1 不限）与按功能分布。
func (a *App) MyAIUsage(c *gin.Context) {
	u := currentUser(c)
	var rows []struct {
		Feature string
		Calls   int64
		Tokens  int64
	}
	a.DB.Model(&models.AIUsageLog{}).Select("feature, COUNT(*) AS calls, COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens").
		Where("user_id = ? AND status = ? AND created_at >= ?", u.ID, "ok", monthStart(time.Now())).Group("feature").Order("tokens DESC").Scan(&rows)
	var used, calls int64
	items := make([]gin.H, 0, len(rows))
	for _, r := range rows {
		used += r.Tokens
		calls += r.Calls
		items = append(items, gin.H{"feature": r.Feature, "calls": r.Calls, "tokens": r.Tokens})
	}
	ok(c, gin.H{"month_start": monthStart(time.Now()), "used_tokens": used, "calls": calls,
		"limit": a.entitlement(u, entAIMonthlyTokens), "by_feature": items})
}

// —— 管理端 ——

type usageAgg struct {
	Calls        int64 `json:"calls"`
	Errors       int64 `json:"errors"`
	InputTokens  int64 `json:"input_tokens"`
	OutputTokens int64 `json:"output_tokens"`
	CostMicros   int64 `json:"cost_micros"`
}

func (g *usageAgg) add(r *models.AIUsageLog) {
	g.Calls++
	if r.Status != "ok" {
		g.Errors++
		return
	}
	g.InputTokens += r.InputTokens
	g.OutputTokens += r.OutputTokens
	g.CostMicros += r.CostMicros
}

type keyedAgg struct {
	Key string `json:"key"`
	usageAgg
}

func sortedAggs(m map[string]*usageAgg, limit int) []keyedAgg {
	out := make([]keyedAgg, 0, len(m))
	for k, v := range m {
		out = append(out, keyedAgg{Key: k, usageAgg: *v})
	}
	sort.Slice(out, func(i, j int) bool {
		ti, tj := out[i].InputTokens+out[i].OutputTokens, out[j].InputTokens+out[j].OutputTokens
		if ti != tj {
			return ti > tj
		}
		return out[i].Key < out[j].Key
	})
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out
}

// AdminAIUsage GET /admin/ai/usage?days=7|30|90 期间汇总、每日趋势、按功能/模型分布与用量最高的用户。
func (a *App) AdminAIUsage(c *gin.Context) {
	days := atoiDefault(c.Query("days"), defaultAIUsageDays)
	if days != 7 && days != 30 && days != 90 {
		days = defaultAIUsageDays
	}
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	from := today.AddDate(0, 0, -(days - 1))

	total := usageAgg{}
	daily := map[string]*usageAgg{}
	byFeature, byModel, byUser := map[string]*usageAgg{}, map[string]*usageAgg{}, map[string]*usageAgg{}
	bucket := func(m map[string]*usageAgg, k string) *usageAgg {
		if m[k] == nil {
			m[k] = &usageAgg{}
		}
		return m[k]
	}
	// 逐行聚合（与数据库方言无关，按服务器本地日期分桶）
	rows, err := a.DB.Model(&models.AIUsageLog{}).
		Select("user_id, feature, model, input_tokens, output_tokens, cost_micros, status, created_at").
		Where("created_at >= ?", from).Rows()
	if err != nil {
		fail(c, http.StatusInternalServerError, "统计失败")
		return
	}
	for rows.Next() {
		var r models.AIUsageLog
		if a.DB.ScanRows(rows, &r) != nil {
			continue
		}
		total.add(&r)
		bucket(daily, r.CreatedAt.In(now.Location()).Format("2006-01-02")).add(&r)
		bucket(byFeature, r.Feature).add(&r)
		if r.Model != "" {
			bucket(byModel, r.Model).add(&r)
		}
		bucket(byUser, strconv.FormatUint(uint64(r.UserID), 10)).add(&r)
	}
	_ = rows.Close()

	series := make([]gin.H, 0, days)
	for d := from; !d.After(today); d = d.AddDate(0, 0, 1) {
		key := d.Format("2006-01-02")
		agg := usageAgg{}
		if daily[key] != nil {
			agg = *daily[key]
		}
		series = append(series, gin.H{"date": key, "calls": agg.Calls, "tokens": agg.InputTokens + agg.OutputTokens, "cost_micros": agg.CostMicros})
	}

	top := sortedAggs(byUser, defaultAIUsageTopUser)
	ids := make([]uint, 0, len(top))
	for _, t := range top {
		if id, _ := strconv.ParseUint(t.Key, 10, 64); id > 0 {
			ids = append(ids, uint(id))
		}
	}
	names := map[uint]string{}
	if len(ids) > 0 {
		var users []models.User
		a.DB.Select("id, username").Where("id IN ?", ids).Find(&users)
		for _, u := range users {
			names[u.ID] = u.Username
		}
	}
	topUsers := make([]gin.H, 0, len(top))
	for _, t := range top {
		id, _ := strconv.ParseUint(t.Key, 10, 64)
		topUsers = append(topUsers, gin.H{"user_id": id, "username": names[uint(id)], "usage": t.usageAgg})
	}

	var features []string
	a.DB.Model(&models.AIUsageLog{}).Distinct("feature").Order("feature").Pluck("feature", &features)
	ok(c, gin.H{
		"days": days, "currency": a.aiPricing().Currency, "total": total, "daily": series,
		"by_feature": sortedAggs(byFeature, 0), "by_model": sortedAggs(byModel, 0), "top_users": topUsers, "features": features,
	})
}

// AdminAIUsageLogs GET /admin/ai/usage/logs?page=&page_size=&feature=&status=&user= 调用明细（user 为用户名）。
func (a *App) AdminAIUsageLogs(c *gin.Context) {
	page, pageSize := paginate(c)
	q := a.DB.Model(&models.AIUsageLog{})
	if f := strings.TrimSpace(c.Query("feature")); f != "" {
		q = q.Where("feature = ?", f)
	}
	if s := c.Query("status"); s == "ok" || s == "error" {
		q = q.Where("status = ?", s)
	}
	if name := strings.TrimSpace(c.Query("user")); name != "" {
		var u models.User
		if a.DB.Select("id").Where("username = ?", name).First(&u).Error != nil {
			ok(c, plugincore.PageResult{Items: []any{}, Total: 0, Page: page, PageSize: pageSize})
			return
		}
		q = q.Where("user_id = ?", u.ID)
	}
	var total int64
	q.Count(&total)
	var rows []models.AIUsageLog
	q.Order("id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&rows)
	ids := []uint{}
	for _, r := range rows {
		if r.UserID > 0 {
			ids = append(ids, r.UserID)
		}
	}
	names := map[uint]string{}
	if len(ids) > 0 {
		var users []models.User
		a.DB.Select("id, username").Where("id IN ?", ids).Find(&users)
		for _, u := range users {
			names[u.ID] = u.Username
		}
	}
	items := make([]gin.H, 0, len(rows))
	for _, r := range rows {
		items = append(items, gin.H{"log": r, "username": names[r.UserID]})
	}
	ok(c, plugincore.PageResult{Items: items, Total: total, Page: page, PageSize: pageSize})
}
