package app

import (
	"infosphere/server/internal/authz"
	"infosphere/server/internal/models"
)

// achievements 插件（成就系统）自注册。
func init() {
	registerPlugin(pluginInfo{
		Order:       20,
		Key:         pluginAchievements,
		Name:        "成就系统",
		Description: "为用户提供成就、徽章与进度追踪。启用后管理后台显示「成就管理」，用户端显示成就页；禁用后相关页面与接口一并停用。首次启用时建表、注册权限，卸载可清除数据。",
		Kind:        pluginKindFeature,
		Builtin:     true,
		EnabledKey:  cfgAchievementsEnabled,
		Models: []any{
			&models.AchievementAsset{}, &models.AchievementDefinition{}, &models.AchievementRule{},
			&models.AchievementDefinitionVersion{}, &models.UserAchievementProgress{},
			&models.UserAchievement{}, &models.AchievementEvent{},
		},
		Tables: []string{
			"achievement_events", "user_achievements", "user_achievement_progresses",
			"achievement_definition_versions", "achievement_rules", "achievement_definitions", "achievement_assets",
		},
		AdminPerms: []authz.Permission{authz.AchievementManage, authz.AchievementGrant},
		UserPerms:  []authz.Permission{authz.AchievementRead, authz.AchievementUpdate},
		OnEnable:   func(a *App) error { _, err := a.enqueueAchievementRecalculation(0); return err },
	})
}
