package achievements

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"gorm.io/gorm"

	"knowforge/server/internal/jobqueue"
	"knowforge/server/internal/models"
)

const (
	achievementRecalculateJobType = "achievement.recalculate"
	achievementEvaluateJobType    = "achievement.evaluate"
)

type achievementRecalculateJob struct {
	AchievementID uint `json:"achievement_id,omitempty"`
}

type achievementEvaluateJob struct {
	EventID uint `json:"event_id"`
}

func (am *behavior) enqueueAchievementRecalculation(achievementID uint) (*models.BackgroundJob, error) {
	queue := am.core.JobQueue()
	if queue == nil {
		return nil, fmt.Errorf("任务队列未初始化")
	}
	return queue.Enqueue(context.Background(), achievementRecalculateJobType, achievementRecalculateJob{AchievementID: achievementID}, 3)
}

func (am *behavior) runAchievementRecalculateJob(ctx context.Context, raw json.RawMessage) error {
	var job achievementRecalculateJob
	if err := json.Unmarshal(raw, &job); err != nil {
		return fmt.Errorf("解析成就重算任务失败: %w", err)
	}
	if !am.achievementSettings().Enabled {
		return nil
	}
	definitions := []models.AchievementDefinition{}
	query := am.core.Gorm().WithContext(ctx).Preload("Rules", func(db *gorm.DB) *gorm.DB { return db.Order("sort_order ASC, id ASC") }).Where("status = ? AND grant_mode = ?", "active", "auto")
	if job.AchievementID > 0 {
		query = query.Where("id = ?", job.AchievementID)
	}
	if err := query.Find(&definitions).Error; err != nil {
		return err
	}
	const batchSize = 200
	for offset := 0; ; offset += batchSize {
		users := []models.User{}
		if err := am.core.Gorm().WithContext(ctx).Select("id").Where("is_active = ?", true).Order("id ASC").Limit(batchSize).Offset(offset).Find(&users).Error; err != nil {
			return err
		}
		for _, user := range users {
			select {
			case <-ctx.Done():
				return ctx.Err()
			default:
			}
			for _, definition := range definitions {
				if err := am.evaluateAchievementForUser(user.ID, definition); err != nil {
					return fmt.Errorf("评估用户 %d 的成就 %d 失败: %w", user.ID, definition.ID, err)
				}
			}
		}
		if len(users) < batchSize {
			break
		}
	}
	return nil
}

func (am *behavior) enqueuePendingAchievementEvents(queue *jobqueue.Queue) {
	if queue == nil || !am.achievementSettings().Enabled {
		return
	}
	events := []models.AchievementEvent{}
	stale := currentTime().Add(-time.Hour)
	if err := am.core.Gorm().Where("processed_at IS NULL AND (enqueued_at IS NULL OR enqueued_at < ?)", stale).Order("id ASC").Limit(500).Find(&events).Error; err != nil {
		return
	}
	for _, event := range events {
		am.enqueueAchievementEvent(queue, event.ID)
	}
}

func (am *behavior) enqueueAchievementEvent(queue *jobqueue.Queue, eventID uint) {
	if queue == nil || eventID == 0 {
		return
	}
	if _, err := queue.Enqueue(context.Background(), achievementEvaluateJobType, achievementEvaluateJob{EventID: eventID}, 5); err == nil {
		am.core.Gorm().Model(&models.AchievementEvent{}).Where("id = ?", eventID).Update("enqueued_at", currentTime())
	}
}

func (am *behavior) runAchievementEvaluateJob(ctx context.Context, raw json.RawMessage) error {
	var job achievementEvaluateJob
	if err := json.Unmarshal(raw, &job); err != nil || job.EventID == 0 {
		return fmt.Errorf("成就评估任务参数无效")
	}
	var event models.AchievementEvent
	if err := am.core.Gorm().WithContext(ctx).First(&event, job.EventID).Error; err != nil {
		return nil
	}
	if event.ProcessedAt != nil || !am.achievementSettings().Enabled {
		return nil
	}
	if err := am.evaluateAllAchievementsForUser(event.UserID); err != nil {
		am.core.Gorm().Model(&event).Update("last_error", truncateText(err.Error(), 1000))
		return err
	}
	now := currentTime()
	return am.core.Gorm().Model(&event).Updates(map[string]any{"processed_at": now, "last_error": ""}).Error
}
