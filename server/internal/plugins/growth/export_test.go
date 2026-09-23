package growth

import (
	"knowforge/server/internal/models"
	"knowforge/server/internal/plugincore"
)

// 仅供外部测试包（growth_test）使用的内部入口。

func Profile(core plugincore.Core, userID uint) models.UserGrowthProfile {
	return (&behavior{core: core}).growthProfile(userID)
}

func AwardExperience(core plugincore.Core, userID uint, ruleKey, sourceType, sourceID, dedupeKey string) {
	(&behavior{core: core}).awardExperience(userID, ruleKey, sourceType, sourceID, dedupeKey)
}
