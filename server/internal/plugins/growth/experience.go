package growth

import (
	"fmt"
	"strconv"
	"time"

	"gorm.io/gorm/clause"

	"knowforge/server/internal/models"
	"knowforge/server/internal/plugincore"
	"knowforge/server/internal/plugins"
)

// 经验服务层：订阅核心事件（评论、首次读章节、章节发布）按经验规则发经验，
// 为其他插件（如成就解锁奖励）提供幂等记账，并在等级变化时写历史、发通知、发出 growth.level_changed 活动。
// 插件禁用时全部为安全空操作。

func init() {
	plugincore.ProvideExperienceRecorder(func(core plugincore.Core, userID uint, ruleKey, sourceType, sourceID, dedupeKey string, xp int, reason string) {
		(&behavior{core: core}).recordExperience(userID, ruleKey, sourceType, sourceID, dedupeKey, xp, reason)
	})
	plugincore.OnActivity(func(core plugincore.Core, ev plugincore.ActivityEvent) {
		b := &behavior{core: core}
		switch ev.Type {
		case "comment.created":
			b.awardExperience(ev.UserID, "community.comment", "comment", ev.SourceID, "community.comment:"+ev.SourceID)
		case "chapter.read":
			// 首次读章节：以已读记录 id 去重（与迁移前的去重键一致）
			var read models.ReadChapter
			if core.Gorm().Select("id").Where("user_id = ? AND doc_id = ?", ev.UserID, ev.SourceID).First(&read).Error == nil {
				b.awardExperience(ev.UserID, "reading.chapter", "document", ev.SourceID, fmt.Sprintf("reading.chapter:%d", read.ID))
			}
		}
	})
	plugincore.OnChapterPublished(func(core plugincore.Core, _ *models.Book, doc *models.Document) {
		id := strconv.FormatUint(uint64(doc.ID), 10)
		(&behavior{core: core}).awardExperience(doc.UserID, "creation.chapter_published", "document", id, "creation.chapter_published:"+id)
	})
	// 首次启用：种子默认等级与经验规则
	plugincore.OnPluginEnabled(plugins.KeyGrowth, func(core plugincore.Core) error {
		b := &behavior{core: core}
		b.seedDefaultLevels()
		b.seedExperienceRules()
		return nil
	})
	// 删除用户时一并清理其成长数据
	plugincore.RegisterUserDataModels(&models.UserGrowthProfile{}, &models.ExperienceEvent{}, &models.UserLevelHistory{})
}

// seedDefaultLevels 首次启用时种子一套默认等级（已存在则跳过）。
func (b *behavior) seedDefaultLevels() {
	db := b.core.Gorm()
	var count int64
	db.Model(&models.LevelDefinition{}).Count(&count)
	if count > 0 {
		return
	}
	thresholds := []int{0, 100, 250, 500, 1000, 2000, 4000, 8000, 16000, 32000}
	colors := []string{"#94a3b8", "#22c55e", "#0ea5e9", "#6366f1", "#a855f7", "#ec4899", "#f59e0b", "#ef4444", "#14b8a6", "#eab308"}
	for i, min := range thresholds {
		lvl := i + 1
		db.Create(&models.LevelDefinition{
			Level: lvl, Key: fmt.Sprintf("lv%d", lvl), Name: fmt.Sprintf("Lv.%d", lvl),
			IconType: "fa", IconValue: "fa-star", Color: colors[i%len(colors)],
			MinXP: min, SortOrder: lvl, Status: "active",
		})
	}
}

// seedExperienceRules 首次启用时种子默认经验规则（已存在则跳过）。
func (b *behavior) seedExperienceRules() {
	db := b.core.Gorm()
	var count int64
	db.Model(&models.ExperienceRule{}).Count(&count)
	if count > 0 {
		return
	}
	defaults := []models.ExperienceRule{
		{RuleKey: "reading.chapter", Label: "阅读章节（首次）", BaseXP: 5, DailyCap: 50, Enabled: true, SortOrder: 1},
		{RuleKey: "creation.chapter_published", Label: "发布章节", BaseXP: 10, DailyCap: 100, Enabled: true, SortOrder: 2},
		{RuleKey: "community.comment", Label: "发表评论", BaseXP: 3, DailyCap: 30, Enabled: true, SortOrder: 3},
	}
	for i := range defaults {
		db.Create(&defaults[i])
	}
}

// awardExperience 按「经验规则」给固定事件发经验：读取 base_xp，并执行每人每日上限。
func (b *behavior) awardExperience(userID uint, ruleKey, sourceType, sourceID, dedupeKey string) {
	if !b.core.PluginEnabled(plugins.KeyGrowth) || userID == 0 {
		return
	}
	db := b.core.Gorm()
	var r models.ExperienceRule
	if db.Where("rule_key = ?", ruleKey).First(&r).Error != nil || !r.Enabled || r.BaseXP == 0 {
		return
	}
	if r.DailyCap > 0 {
		var todaySum int64
		db.Model(&models.ExperienceEvent{}).
			Where("user_id = ? AND rule_key = ? AND created_at >= ?", userID, ruleKey, dayStart(time.Now())).
			Select("COALESCE(SUM(final_xp),0)").Scan(&todaySum)
		if todaySum >= int64(r.DailyCap) {
			return // 已达每日上限，不再入账
		}
	}
	b.recordExperience(userID, ruleKey, sourceType, sourceID, dedupeKey, r.BaseXP, "")
}

// recordExperience 幂等记账一条经验流水并重算资料。dedupeKey 唯一，重复/并发只落一条。
func (b *behavior) recordExperience(userID uint, ruleKey, sourceType, sourceID, dedupeKey string, xp int, reason string) {
	if !b.core.PluginEnabled(plugins.KeyGrowth) || userID == 0 || xp == 0 || dedupeKey == "" {
		return
	}
	ev := models.ExperienceEvent{
		UserID: userID, RuleKey: ruleKey, SourceType: sourceType, SourceID: sourceID,
		DedupeKey: dedupeKey, BaseXP: xp, FinalXP: xp, Reason: reason,
	}
	res := b.core.Gorm().Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "dedupe_key"}}, DoNothing: true}).Create(&ev)
	if res.Error != nil || res.RowsAffected == 0 {
		return // 幂等：重复事件不重复结算
	}
	b.recalcGrowthProfile(userID)
}

// resolveLevel 按经验总量解析当前等级编号（取 min_xp<=xp 的最高 active 等级；无则 1）。
func (b *behavior) resolveLevel(xp int64) int {
	var lvl models.LevelDefinition
	if err := b.core.Gorm().Where("status = ? AND min_xp <= ?", "active", xp).Order("min_xp DESC, level DESC").First(&lvl).Error; err != nil {
		return 1
	}
	return lvl.Level
}

// recalcGrowthProfile 从经验流水重算用户成长资料（权威汇总），并在等级变化时写历史 + 升级通知。
func (b *behavior) recalcGrowthProfile(userID uint) {
	db := b.core.Gorm()
	var total int64
	db.Model(&models.ExperienceEvent{}).Where("user_id = ?", userID).Select("COALESCE(SUM(final_xp),0)").Scan(&total)
	newLevel := b.resolveLevel(total)

	var p models.UserGrowthProfile
	if err := db.Where("user_id = ?", userID).First(&p).Error; err != nil {
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
	db.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "user_id"}}, UpdateAll: true}).Create(&p)

	if newLevel != oldLevel {
		db.Create(&models.UserLevelHistory{UserID: userID, FromLevel: oldLevel, ToLevel: newLevel, Reason: "xp"})
		if newLevel > oldLevel {
			b.core.Notify(userID, "growth", fmt.Sprintf("成长升级：Lv.%d", newLevel), map[string]any{"link": "/user/growth"})
		}
		// 成长→成就 双向联动：等级变化发出活动，触发 growth.* 指标成就重新评估（每级去重）
		plugincore.FireActivity(b.core, plugincore.ActivityEvent{
			UserID: userID, Type: "growth.level_changed", SourceType: "user",
			SourceID: strconv.FormatUint(uint64(userID), 10), DedupeKey: fmt.Sprintf("growth.level:%d:%d", userID, newLevel),
		})
	}
}

// dayStart 本地时区当天零点（与核心书籍分析的日桶一致）。
func dayStart(value time.Time) time.Time {
	local := value.In(time.Local)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.Local)
}
