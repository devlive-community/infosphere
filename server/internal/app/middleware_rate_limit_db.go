package app

import (
	"time"

	"knowforge/server/internal/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// dbRateLimitStore 将限流计数落数据库，支持多实例部署（跨实例共享固定窗口计数）。
// 仅用于低频写端点（登录/注册/评论/上传/举报/互动），非每请求路径，DB 开销可接受。
type dbRateLimitStore struct {
	db *gorm.DB
}

func newDBRateLimitStore(db *gorm.DB) *dbRateLimitStore {
	return &dbRateLimitStore{db: db}
}

// Take 固定窗口计数：确保当前窗口行存在、过期则重置，再以「count < limit」条件原子自增。
// 条件自增的 RowsAffected 决定是否放行，使并发/多实例下的上限判定交给数据库保证。
func (s *dbRateLimitStore) Take(key string, limit int, window time.Duration, now time.Time) (bool, int, time.Duration) {
	if s.db == nil {
		return true, limit, window // 未安装/无数据库时放行（此时不存在滥用面）
	}
	reset := now.Add(window)

	// 1. 确保存在一行（全新 key 起一个新窗口）
	s.db.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "rate_key"}}, DoNothing: true}).
		Create(&models.RateLimitCounter{RateKey: key, Count: 0, ResetAt: reset})
	// 2. 过期窗口原子重置为新窗口
	s.db.Model(&models.RateLimitCounter{}).
		Where("rate_key = ? AND reset_at <= ?", key, now).
		Updates(map[string]any{"count": 0, "reset_at": reset})
	// 3. 未达上限时原子自增；RowsAffected==1 表示本次放行
	res := s.db.Model(&models.RateLimitCounter{}).
		Where("rate_key = ? AND count < ?", key, limit).
		Update("count", gorm.Expr("count + 1"))
	allowed := res.Error == nil && res.RowsAffected == 1

	// 4. 回读当前计数与窗口，计算剩余额度与重试等待
	var row models.RateLimitCounter
	if err := s.db.Where("rate_key = ?", key).First(&row).Error; err != nil {
		return allowed, 0, window
	}
	remaining := limit - row.Count
	if remaining < 0 {
		remaining = 0
	}
	wait := row.ResetAt.Sub(now)
	if wait < 0 {
		wait = 0
	}
	return allowed, remaining, wait
}

// purgeExpiredRateLimits 清理已过期的限流计数行（由维护任务周期调用）。
func purgeExpiredRateLimits(db *gorm.DB, now time.Time) error {
	return db.Where("reset_at < ?", now).Delete(&models.RateLimitCounter{}).Error
}
