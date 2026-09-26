package chapterguide

import "time"

// 导读状态。
const (
	stateQueued     = "queued"     // 已排队
	stateGenerating = "generating" // 生成中
	stateReady      = "ready"
	stateFailed     = "failed"
	stateSkipped    = "skipped" // 章节没有正文
)

// Guide 章节导读：阅读前的导读（一两段）与本章要点。SourceHash 为生成（或作者编辑）时章节标题 + 正文的摘要，
// 与当前内容不同即为「已过期」；作者编辑过的导读（Edited）不会被自动更新覆盖。
type Guide struct {
	ID           uint       `gorm:"primaryKey" json:"id"`
	BookID       uint       `gorm:"index" json:"book_id"`
	DocID        uint       `gorm:"uniqueIndex" json:"doc_id"`
	Summary      string     `gorm:"type:text" json:"summary"`
	Points       string     `gorm:"type:text" json:"-"` // JSON []string
	SourceHash   string     `gorm:"size:64" json:"-"`
	Status       string     `gorm:"size:12" json:"status"`
	Error        string     `gorm:"size:500" json:"error"`
	Edited       bool       `json:"edited"`
	Model        string     `gorm:"size:100" json:"model"`
	InputTokens  int64      `json:"input_tokens"`
	OutputTokens int64      `json:"output_tokens"`
	DirtyAt      *time.Time `json:"-"` // 内容修改后待自动更新（自动模式）
	GeneratedAt  *time.Time `json:"generated_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

func (Guide) TableName() string { return "chapter_guides" }

// Overview 全书概览（Markdown），基于已发布章节的导读（或开头）生成；SourceHash 为这些章节内容摘要的组合。
type Overview struct {
	BookID       uint       `gorm:"primaryKey" json:"book_id"`
	Content      string     `gorm:"type:text" json:"content"`
	SourceHash   string     `gorm:"size:64" json:"-"`
	Status       string     `gorm:"size:12" json:"status"`
	Error        string     `gorm:"size:500" json:"error"`
	Edited       bool       `json:"edited"`
	Model        string     `gorm:"size:100" json:"model"`
	InputTokens  int64      `json:"input_tokens"`
	OutputTokens int64      `json:"output_tokens"`
	GeneratedAt  *time.Time `json:"generated_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

func (Overview) TableName() string { return "book_guide_overviews" }

// BookSetting 书籍级设置：发布或修改已发布章节后自动生成/更新导读。
type BookSetting struct {
	BookID       uint `gorm:"primaryKey" json:"-"`
	AutoGenerate bool `json:"auto_generate"`
}

func (BookSetting) TableName() string { return "chapter_guide_book_settings" }

// Run 一次生成（章节导读或全书概览），用于统计每月生成次数（权益）。
type Run struct {
	ID        uint `gorm:"primaryKey"`
	UserID    uint `gorm:"index"`
	BookID    uint `gorm:"index"`
	DocID     uint
	Kind      string    `gorm:"size:10"` // chapter | overview
	CreatedAt time.Time `gorm:"index"`
}

func (Run) TableName() string { return "chapter_guide_runs" }
