package achievements

import (
	"context"
	"encoding/json"
	"strconv"

	"knowforge/server/internal/models"
	"knowforge/server/internal/plugincore"
	"knowforge/server/internal/plugins"
)

// 成就奖励经验：每个用户每个成就「只持有一份」——
//   - 解锁/授予时经成长插件 GrantExperienceOnce 发放（该成就净经验 > 0 时不重复发）；
//   - 撤销时 RevokeExperience 收回；
//   - 成长插件（重新）启用时对账：停用期间撤销的收回、停用期间获得的补发，保证与授予状态一致且不重复。

const (
	rewardRuleKey            = "achievement.unlocked"
	achievementRewardJobType = "achievement.reward_reconcile"
	rewardReconcileBatchSize = 500
)

func init() {
	plugincore.RegisterJob(achievementRewardJobType, func(core plugincore.Core) func(context.Context, json.RawMessage) error {
		return (&behavior{core: core}).runRewardReconcile
	})
	plugincore.OnExperienceReady(func(core plugincore.Core) {
		b := &behavior{core: core}
		if queue := core.JobQueue(); queue != nil {
			if _, err := queue.Enqueue(context.Background(), achievementRewardJobType, struct{}{}, 3); err == nil {
				return
			}
		}
		_ = b.runRewardReconcile(context.Background(), nil) // 队列不可用时同步执行
	})
}

// grantRewardXP 发放成就奖励经验（只一份）。
func (am *behavior) grantRewardXP(userID uint, definition models.AchievementDefinition) {
	plugincore.GrantExperienceOnce(am.core, userID, rewardRuleKey, "achievement", strconv.FormatUint(uint64(definition.ID), 10), definition.RewardXP, "")
}

// runRewardReconcile 按授予状态对账全部有奖励经验的成就：已撤销 → 收回；有效 → 确保持有一份。
func (am *behavior) runRewardReconcile(ctx context.Context, _ json.RawMessage) error {
	db := am.core.Gorm()
	if !am.core.PluginEnabled(plugins.KeyAchievements) || !db.Migrator().HasTable(&models.UserAchievement{}) {
		return nil
	}
	var definitions []models.AchievementDefinition
	if err := db.WithContext(ctx).Where("reward_xp > 0").Find(&definitions).Error; err != nil {
		return err
	}
	byID := make(map[uint]models.AchievementDefinition, len(definitions))
	ids := make([]uint, 0, len(definitions))
	for _, d := range definitions {
		byID[d.ID] = d
		ids = append(ids, d.ID)
	}
	if len(ids) == 0 {
		return nil
	}
	for lastID := uint(0); ; {
		var grants []models.UserAchievement
		if err := db.WithContext(ctx).Where("achievement_id IN ? AND id > ?", ids, lastID).Order("id ASC").Limit(rewardReconcileBatchSize).Find(&grants).Error; err != nil {
			return err
		}
		for _, g := range grants {
			select {
			case <-ctx.Done():
				return ctx.Err()
			default:
			}
			if g.RevokedAt != nil {
				plugincore.RevokeExperience(am.core, g.UserID, rewardRuleKey, strconv.FormatUint(uint64(g.AchievementID), 10), "achievement_revoked")
			} else {
				am.grantRewardXP(g.UserID, byID[g.AchievementID])
			}
			lastID = g.ID
		}
		if len(grants) < rewardReconcileBatchSize {
			return nil
		}
	}
}
