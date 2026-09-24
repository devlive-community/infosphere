package achievements

import (
	"knowforge/server/internal/models"
	"knowforge/server/internal/plugincore"
)

// 仅供外部测试包（achievements_test）使用的内部入口。

type Settings = achievementSettings

const EvaluateJobType = achievementEvaluateJobType

func LoadSettings(core plugincore.Core) Settings {
	return (&behavior{core: core}).achievementSettings()
}

func EvaluateForUser(core plugincore.Core, userID uint, definition models.AchievementDefinition) error {
	return (&behavior{core: core}).evaluateAchievementForUser(userID, definition)
}

func EvaluateMetric(core plugincore.Core, userID uint, rule models.AchievementRule) (int64, error) {
	return (&behavior{core: core}).evaluateAchievementMetric(userID, rule)
}

func PresetCount() int { return len(presetAchievements) }
