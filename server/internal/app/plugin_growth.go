package app

import (
	"infosphere/server/internal/authz"
	"infosphere/server/internal/models"
)

// growth 插件（成长等级）自注册。
func init() {
	registerPlugin(pluginInfo{
		Order:       60,
		Key:         pluginGrowth,
		Name:        "成长等级",
		Description: "用户成长等级：经验流水、等级、升级通知与公开徽标；经验来自成就解锁等权威事件。默认关闭，启用后建表、注册权限并种子默认等级；禁用后页面/入口/接口一并停用，数据保留。",
		Kind:        pluginKindFeature,
		Builtin:     true,
		EnabledKey:  cfgGrowthEnabled,
		Models:      []any{&models.LevelDefinition{}, &models.UserGrowthProfile{}, &models.ExperienceEvent{}, &models.UserLevelHistory{}, &models.ExperienceRule{}},
		Tables:      []string{"user_level_histories", "experience_events", "user_growth_profiles", "level_definitions", "experience_rules"},
		AdminPerms:  []authz.Permission{authz.GrowthManage, authz.ExperienceAdjust},
		UserPerms:   []authz.Permission{authz.GrowthRead, authz.GrowthUpdate},
		OnEnable:    func(a *App) error { a.seedDefaultLevels(); a.seedExperienceRules(); return nil },
	})
}
