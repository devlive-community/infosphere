package achievements

import (
	"infosphere/server/internal/authz"
	"infosphere/server/internal/models"
	"infosphere/server/internal/plugins"
)

func init() {
	plugins.Register(plugins.Meta{
		Order:       20,
		Key:         plugins.KeyAchievements,
		Name:        "成就系统",
		Description: "为用户提供成就、徽章与进度追踪。启用后管理后台显示「成就管理」，用户端显示成就页；禁用后相关页面与接口一并停用。首次启用时建表、注册权限，卸载可清除数据。",
		Kind:        plugins.KindFeature,
		Builtin:     true,
		EnabledKey:  "achievements_enabled",
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
	})
}
