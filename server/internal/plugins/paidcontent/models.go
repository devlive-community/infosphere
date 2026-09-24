package paidcontent

import "time"

// PaidBook 书籍的付费设置（作者配置）。
type PaidBook struct {
	BookID            uint      `gorm:"primaryKey" json:"book_id"`
	Enabled           bool      `json:"enabled"`
	BookPriceCents    int64     `json:"book_price_cents"`    // 整本价格；0 表示不单独售卖整本
	ChapterPriceCents int64     `json:"chapter_price_cents"` // 章节默认价格；0 表示章节不单独售卖（只能整本购买）
	FreeChapters      int       `json:"free_chapters"`       // 按目录顺序前 N 章免费
	PreviewPercent    int       `json:"preview_percent"`     // 未解锁章节的试读比例（0–50）
	FreeTier          int       `json:"free_tier"`           // 内容访问等级 ≥ 此值免费阅读；0 表示不启用
	UpdatedAt         time.Time `json:"updated_at"`
}

func (PaidBook) TableName() string { return "paid_books" }

// PaidDoc 单个章节的设置（覆盖书籍默认）：免费或自定义价格。
type PaidDoc struct {
	DocID      uint  `gorm:"primaryKey" json:"doc_id"`
	BookID     uint  `gorm:"index" json:"book_id"`
	Free       bool  `json:"free"`
	PriceCents int64 `json:"price_cents"` // 0 表示使用书籍默认章节价格
}

func (PaidDoc) TableName() string { return "paid_docs" }

// Purchase 购买记录（解锁凭证）：DocID 为 0 表示整本。
type Purchase struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	UserID      uint      `gorm:"index" json:"user_id"`
	BookID      uint      `gorm:"index" json:"book_id"`
	DocID       uint      `gorm:"index" json:"doc_id"`
	OrderNo     string    `gorm:"size:40;uniqueIndex" json:"order_no"`
	AmountCents int64     `json:"amount_cents"`
	Currency    string    `gorm:"size:3" json:"currency"`
	AuthorID    uint      `gorm:"index" json:"author_id"`
	CreatedAt   time.Time `json:"created_at"`
}

func (Purchase) TableName() string { return "paid_purchases" }

// 收益流水类型。
const (
	LedgerSale             = "sale"              // 售出：+净收益
	LedgerWithdrawal       = "withdrawal"        // 申请提现：-金额（冻结）
	LedgerWithdrawalRevert = "withdrawal_revert" // 提现被驳回：+金额（退回）
)

// LedgerEntry 作者收益流水；余额 = NetCents 之和。
type LedgerEntry struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	AuthorID        uint      `gorm:"index" json:"author_id"`
	Kind            string    `gorm:"size:20;index" json:"kind"`
	OrderNo         string    `gorm:"size:40;index" json:"order_no"`
	BookID          uint      `json:"book_id"`
	DocID           uint      `json:"doc_id"`
	Title           string    `gorm:"size:255" json:"title"`
	BuyerID         uint      `json:"buyer_id"`
	GrossCents      int64     `json:"gross_cents"`
	CommissionCents int64     `json:"commission_cents"`
	NetCents        int64     `json:"net_cents"`
	Currency        string    `gorm:"size:3" json:"currency"`
	WithdrawalID    uint      `json:"withdrawal_id"`
	CreatedAt       time.Time `json:"created_at"`
}

func (LedgerEntry) TableName() string { return "paid_ledger_entries" }

// 提现状态。
const (
	WithdrawalPending  = "pending"
	WithdrawalPaid     = "paid"
	WithdrawalRejected = "rejected"
)

// Withdrawal 提现申请：申请时冻结（流水 -金额），打款确认后完成，驳回则退回。
type Withdrawal struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	AuthorID    uint       `gorm:"index" json:"author_id"`
	AmountCents int64      `json:"amount_cents"`
	Currency    string     `gorm:"size:3" json:"currency"`
	Account     string     `gorm:"size:500" json:"account"` // 收款信息（如支付宝账号与姓名）
	Status      string     `gorm:"size:20;index" json:"status"`
	AdminNote   string     `gorm:"size:500" json:"admin_note"`
	ProcessedBy uint       `json:"processed_by"`
	ProcessedAt *time.Time `json:"processed_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

func (Withdrawal) TableName() string { return "paid_withdrawals" }
