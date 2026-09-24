package models

import (
	"fmt"
	"time"

	"gorm.io/gorm"
)

// AIUsageLog 一次模型调用（对话、向量嵌入或机器翻译）的用量记录：调用方、功能、模型、tokens、耗时与按当时单价估算的费用。
// UserID 为 0 表示系统/后台任务（或调用方账号已删除）。
type AIUsageLog struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	UserID       uint      `gorm:"index:idx_ai_usage_user_time,priority:1" json:"user_id"`
	Feature      string    `gorm:"size:50;index" json:"feature"`  // 如 qa.ask、qa.agent、qa.index、translate、admin.test
	TraceID      string    `gorm:"size:40;index" json:"trace_id"` // 调用链：同一次操作的多次调用共用
	RefType      string    `gorm:"size:30" json:"ref_type"`
	RefID        uint      `json:"ref_id"`
	Kind         string    `gorm:"size:10" json:"kind"` // chat | embed | translate（机器翻译，按字符计）
	Provider     string    `gorm:"size:20" json:"provider"`
	Model        string    `gorm:"size:100" json:"model"`
	InputTokens  int64     `json:"input_tokens"`
	OutputTokens int64     `json:"output_tokens"`
	Characters   int64     `json:"characters"`  // 翻译类调用的原文字符数（按字符计费/计量）
	Estimated    bool      `json:"estimated"`   // 服务未返回用量，按文本长度估算
	CostMicros   int64     `json:"cost_micros"` // 估算费用（货币单位的百万分之一），按调用时的单价计算
	Currency     string    `gorm:"size:10" json:"currency"`
	DurationMs   int64     `json:"duration_ms"`
	Status       string    `gorm:"size:10;index" json:"status"` // ok | error
	Error        string    `gorm:"size:300" json:"error"`
	CreatedAt    time.Time `gorm:"index;index:idx_ai_usage_user_time,priority:2" json:"created_at"`
}

func (AIUsageLog) TableName() string { return "ai_usage_logs" }

// backfillAITraceIDs 为缺少调用链 ID 的旧记录补上独立的链 ID（每条单独成链）。
func backfillAITraceIDs(db *gorm.DB) error {
	for {
		var ids []uint
		if err := db.Model(&AIUsageLog{}).Where("trace_id = ? OR trace_id IS NULL", "").Limit(500).Pluck("id", &ids).Error; err != nil {
			return err
		}
		if len(ids) == 0 {
			return nil
		}
		for _, id := range ids {
			if err := db.Model(&AIUsageLog{}).Where("id = ?", id).Update("trace_id", fmt.Sprintf("log-%d", id)).Error; err != nil {
				return err
			}
		}
	}
}
