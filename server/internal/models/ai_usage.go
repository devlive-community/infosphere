package models

import "time"

// AIUsageLog 一次大模型调用（对话或向量嵌入）的用量记录：调用方、功能、模型、tokens、耗时与按当时单价估算的费用。
// UserID 为 0 表示系统/后台任务（或调用方账号已删除）。
type AIUsageLog struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	UserID       uint      `gorm:"index:idx_ai_usage_user_time,priority:1" json:"user_id"`
	Feature      string    `gorm:"size:50;index" json:"feature"` // 如 qa.ask、qa.agent、qa.index、admin.test
	RefType      string    `gorm:"size:30" json:"ref_type"`
	RefID        uint      `json:"ref_id"`
	Kind         string    `gorm:"size:10" json:"kind"` // chat | embed
	Provider     string    `gorm:"size:20" json:"provider"`
	Model        string    `gorm:"size:100" json:"model"`
	InputTokens  int64     `json:"input_tokens"`
	OutputTokens int64     `json:"output_tokens"`
	Estimated    bool      `json:"estimated"`   // 服务未返回用量，按文本长度估算
	CostMicros   int64     `json:"cost_micros"` // 估算费用（货币单位的百万分之一），按调用时的单价计算
	Currency     string    `gorm:"size:10" json:"currency"`
	DurationMs   int64     `json:"duration_ms"`
	Status       string    `gorm:"size:10;index" json:"status"` // ok | error
	Error        string    `gorm:"size:300" json:"error"`
	CreatedAt    time.Time `gorm:"index;index:idx_ai_usage_user_time,priority:2" json:"created_at"`
}

func (AIUsageLog) TableName() string { return "ai_usage_logs" }
