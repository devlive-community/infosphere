package app

import (
	"fmt"
	"strconv"

	"knowforge/server/internal/models"

	"gorm.io/gorm/clause"
)

// 成长「经验服务层」：由核心阅读/评论/发布等事件触发发经验、重算等级，属核心集成，保留在 app；
// 成长插件的查看/管理端点已迁至 internal/plugins/growth/。成长插件禁用时这些函数为安全空操作。

// seedDefaultLevels 首次启用时种子一套默认等级（已存在则跳过）。
func (a *App) seedDefaultLevels() {
	var count int64
	a.DB.Model(&models.LevelDefinition{}).Count(&count)
	if count > 0 {
		return
	}
	thresholds := []int{0, 100, 250, 500, 1000, 2000, 4000, 8000, 16000, 32000}
	colors := []string{"#94a3b8", "#22c55e", "#0ea5e9", "#6366f1", "#a855f7", "#ec4899", "#f59e0b", "#ef4444", "#14b8a6", "#eab308"}
	for i, min := range thresholds {
		lvl := i + 1
		a.DB.Create(&models.LevelDefinition{
			Level: lvl, Key: fmt.Sprintf("lv%d", lvl), Name: fmt.Sprintf("Lv.%d", lvl),
			IconType: "fa", IconValue: "fa-star", Color: colors[i%len(colors)],
			MinXP: min, SortOrder: lvl, Status: "active",
		})
	}
}

// seedExperienceRules 首次启用时种子默认经验规则（已存在则跳过）。
func (a *App) seedExperienceRules() {
	var count int64
	a.DB.Model(&models.ExperienceRule{}).Count(&count)
	if count > 0 {
		return
	}
	defaults := []models.ExperienceRule{
		{RuleKey: "reading.chapter", Label: "阅读章节（首次）", BaseXP: 5, DailyCap: 50, Enabled: true, SortOrder: 1},
		{RuleKey: "creation.chapter_published", Label: "发布章节", BaseXP: 10, DailyCap: 100, Enabled: true, SortOrder: 2},
		{RuleKey: "community.comment", Label: "发表评论", BaseXP: 3, DailyCap: 30, Enabled: true, SortOrder: 3},
	}
	for i := range defaults {
		a.DB.Create(&defaults[i])
	}
}

// experienceRule 读取经验规则。
func (a *App) experienceRule(ruleKey string) (models.ExperienceRule, bool) {
	var r models.ExperienceRule
	if a.DB.Where("rule_key = ?", ruleKey).First(&r).Error != nil {
		return r, false
	}
	return r, true
}

// awardExperience 按「经验规则」给固定事件发经验：读取 base_xp，并执行每人每日上限。
func (a *App) awardExperience(userID uint, ruleKey, sourceType, sourceID, dedupeKey string) {
	if !a.pluginEnabled(pluginGrowth) || userID == 0 {
		return
	}
	r, ok := a.experienceRule(ruleKey)
	if !ok || !r.Enabled || r.BaseXP == 0 {
		return
	}
	if r.DailyCap > 0 {
		var todaySum int64
		start := analyticsDayStart(currentTime())
		a.DB.Model(&models.ExperienceEvent{}).
			Where("user_id = ? AND rule_key = ? AND created_at >= ?", userID, ruleKey, start).
			Select("COALESCE(SUM(final_xp),0)").Scan(&todaySum)
		if todaySum >= int64(r.DailyCap) {
			return // 已达每日上限，不再入账
		}
	}
	a.RecordExperience(userID, ruleKey, sourceType, sourceID, dedupeKey, r.BaseXP, "")
}

// resolveLevel 按经验总量解析当前等级编号（取 min_xp<=xp 的最高 active 等级；无则 1）。
func (a *App) resolveLevel(xp int64) int {
	var lvl models.LevelDefinition
	if err := a.DB.Where("status = ? AND min_xp <= ?", "active", xp).Order("min_xp DESC, level DESC").First(&lvl).Error; err != nil {
		return 1
	}
	return lvl.Level
}

// recalcGrowthProfile 从经验流水重算用户成长资料（权威汇总），并在等级变化时写历史 + 升级通知。
func (a *App) recalcGrowthProfile(userID uint) {
	var total int64
	a.DB.Model(&models.ExperienceEvent{}).Where("user_id = ?", userID).Select("COALESCE(SUM(final_xp),0)").Scan(&total)
	newLevel := a.resolveLevel(total)

	var p models.UserGrowthProfile
	if err := a.DB.Where("user_id = ?", userID).First(&p).Error; err != nil {
		p = models.UserGrowthProfile{UserID: userID, Public: true, CurrentLevel: 1, HighestLevel: 1}
	}
	oldLevel := p.CurrentLevel
	if oldLevel < 1 {
		oldLevel = 1
	}
	p.LifetimeXP = total
	p.CurrentLevel = newLevel
	if newLevel > p.HighestLevel {
		p.HighestLevel = newLevel
	}
	a.DB.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "user_id"}}, UpdateAll: true}).Create(&p)

	if newLevel != oldLevel {
		a.DB.Create(&models.UserLevelHistory{UserID: userID, FromLevel: oldLevel, ToLevel: newLevel, Reason: "xp"})
		if newLevel > oldLevel {
			a.Notify(userID, "growth", fmt.Sprintf("成长升级：Lv.%d", newLevel), map[string]any{"link": "/user/growth"})
		}
		// 成长→成就 双向联动：等级变化写成就事件，触发 growth.* 指标成就重新评估（每级去重）
		a.recordAchievementEvent(userID, "growth.level_changed", "user", strconv.FormatUint(uint64(userID), 10), fmt.Sprintf("growth.level:%d:%d", userID, newLevel))
	}
}

// RecordExperience 幂等记账一条经验流水并重算资料。dedupeKey 唯一，重复/并发只落一条。
func (a *App) RecordExperience(userID uint, ruleKey, sourceType, sourceID, dedupeKey string, xp int, reason string) {
	if !a.pluginEnabled(pluginGrowth) || userID == 0 || xp == 0 || dedupeKey == "" {
		return
	}
	ev := models.ExperienceEvent{
		UserID: userID, RuleKey: ruleKey, SourceType: sourceType, SourceID: sourceID,
		DedupeKey: dedupeKey, BaseXP: xp, FinalXP: xp, Reason: reason,
	}
	res := a.DB.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "dedupe_key"}}, DoNothing: true}).Create(&ev)
	if res.Error != nil || res.RowsAffected == 0 {
		return // 幂等：重复事件不重复结算
	}
	a.recalcGrowthProfile(userID)
}

// growthProfile 读取用户成长资料（无记录返回默认）。供服务层与测试使用。
func (a *App) growthProfile(userID uint) models.UserGrowthProfile {
	p := models.UserGrowthProfile{UserID: userID, Public: true, CurrentLevel: 1, HighestLevel: 1}
	a.DB.Where("user_id = ?", userID).First(&p)
	return p
}
