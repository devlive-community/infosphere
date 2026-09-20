package app

import (
	"strconv"
	"testing"

	"infosphere/server/internal/models"
)

// 成长等级：启用后种子等级，记账经验幂等、按阈值解析等级、升级写历史。
func TestGrowthExperienceAndLeveling(t *testing.T) {
	app, user, db := newContentImportTestApp(t)
	app.Notifications = newNotificationHub()
	// 启用成长插件：建表 + 注册权限 + 种子默认等级
	_ = app.setSetting(cfgGrowthEnabled, "true", "test")
	app.syncPluginState()
	app.seedDefaultLevels()

	var levelCount int64
	db.Model(&models.LevelDefinition{}).Count(&levelCount)
	if levelCount == 0 {
		t.Fatal("启用后应种子默认等级")
	}

	// 记 150 经验 → 达到 Lv.2（L2 min_xp=100）
	app.RecordExperience(user.ID, "test.grant", "x", "1", "dedupe-1", 150, "")
	p := app.growthProfile(user.ID)
	if p.LifetimeXP != 150 || p.CurrentLevel != 2 {
		t.Fatalf("经验/等级错误：xp=%d level=%d", p.LifetimeXP, p.CurrentLevel)
	}

	// 幂等：相同 dedupe 不重复结算
	app.RecordExperience(user.ID, "test.grant", "x", "1", "dedupe-1", 150, "")
	p = app.growthProfile(user.ID)
	if p.LifetimeXP != 150 {
		t.Fatalf("重复 dedupe 应不结算，实际 xp=%d", p.LifetimeXP)
	}

	// 再加到 L3（250）
	app.RecordExperience(user.ID, "test.grant", "x", "2", "dedupe-2", 100, "")
	p = app.growthProfile(user.ID)
	if p.LifetimeXP != 250 || p.CurrentLevel != 3 || p.HighestLevel != 3 {
		t.Fatalf("升级错误：xp=%d level=%d highest=%d", p.LifetimeXP, p.CurrentLevel, p.HighestLevel)
	}
	var histCount int64
	db.Model(&models.UserLevelHistory{}).Where("user_id = ?", user.ID).Count(&histCount)
	if histCount < 2 {
		t.Fatalf("应有 ≥2 条升级历史，实际 %d", histCount)
	}

	// 插件禁用后不再结算
	_ = app.setFeaturePluginEnabled(pluginInfoByKey(pluginGrowth), false)
	app.syncPluginPermissions()
	app.RecordExperience(user.ID, "test.grant", "x", "3", "dedupe-3", 100, "")
	p = app.growthProfile(user.ID)
	if p.LifetimeXP != 250 {
		t.Fatalf("禁用后不应结算，实际 xp=%d", p.LifetimeXP)
	}
	// 恢复全局插件状态
	_ = app.setFeaturePluginEnabled(pluginInfoByKey(pluginGrowth), true)
	app.syncPluginPermissions()
}

// 经验规则：按 base_xp 发放、执行每日上限、禁用规则不发。
func TestExperienceRuleAndDailyCap(t *testing.T) {
	app, user, db := newContentImportTestApp(t)
	app.Notifications = newNotificationHub()
	_ = app.setSetting(cfgGrowthEnabled, "true", "test")
	app.syncPluginState()
	app.seedDefaultLevels()
	// 自定规则：base 5、每日上限 10
	db.Create(&models.ExperienceRule{RuleKey: "test.rule", Label: "T", BaseXP: 5, DailyCap: 10, Enabled: true})

	for i := 0; i < 4; i++ {
		app.awardExperience(user.ID, "test.rule", "x", "1", "cap-"+strconv.Itoa(i))
	}
	if p := app.growthProfile(user.ID); p.LifetimeXP != 10 {
		t.Fatalf("每日上限应封顶在 10，实际 %d", p.LifetimeXP)
	}

	// 禁用规则不发经验
	db.Model(&models.ExperienceRule{}).Where("rule_key = ?", "test.rule").Update("enabled", false)
	app.awardExperience(user.ID, "test.rule", "x", "1", "disabled-1")
	if p := app.growthProfile(user.ID); p.LifetimeXP != 10 {
		t.Fatalf("禁用规则不应发经验，实际 %d", p.LifetimeXP)
	}

	_ = app.setFeaturePluginEnabled(pluginInfoByKey(pluginGrowth), true)
	app.syncPluginPermissions()
}
