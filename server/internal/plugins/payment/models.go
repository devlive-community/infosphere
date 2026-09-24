package payment

import "time"

// 订单状态。
const (
	StatusPending   = "pending"   // 待支付（线下转账：待管理员确认）
	StatusPaid      = "paid"      // 已支付（履约结果见 FulfilledAt / FulfillError）
	StatusCancelled = "cancelled" // 用户或管理员取消
	StatusExpired   = "expired"   // 超时未支付
)

// Order 支付订单：下单时快照商品（标题、金额、履约数据），支付成功后回调商品提供者履约。
// 已取消/已过期的订单若随后收到渠道的支付成功回调，仍按已支付处理（用户确实付了款）。
type Order struct {
	ID           uint   `gorm:"primaryKey" json:"id"`
	OrderNo      string `gorm:"size:40;uniqueIndex;not null" json:"order_no"`
	UserID       uint   `gorm:"index;not null" json:"user_id"`
	Kind         string `gorm:"size:40;not null" json:"kind"`
	SKU          string `gorm:"size:64" json:"sku"`
	Title        string `gorm:"size:200" json:"title"`
	DurationDays int    `json:"duration_days"`
	AmountCents  int64  `gorm:"not null" json:"amount_cents"`
	Currency     string `gorm:"size:3;not null" json:"currency"`
	ReturnLink   string `gorm:"size:255" json:"return_link"`
	Payload      string `gorm:"type:text" json:"-"` // 履约快照（JSON）
	Channel      string `gorm:"size:20;index" json:"channel"`
	Status       string `gorm:"size:20;index;not null" json:"status"`
	// ChannelRef 渠道侧的会话/二维码信息（Stripe Checkout Session ID、微信 code_url），ChannelTradeNo 渠道交易号
	ChannelRef     string     `gorm:"size:512" json:"-"`
	ChannelTradeNo string     `gorm:"size:128" json:"channel_trade_no"`
	PayerNote      string     `gorm:"size:500" json:"payer_note"` // 线下转账：用户填写的付款说明
	ProofAt        *time.Time `json:"proof_at"`
	ExpiresAt      time.Time  `json:"expires_at"`
	PaidAt         *time.Time `json:"paid_at"`
	ConfirmedBy    uint       `json:"confirmed_by"` // 线下转账：确认收款的管理员
	FulfilledAt    *time.Time `json:"fulfilled_at"`
	FulfillError   string     `gorm:"size:500" json:"fulfill_error"`
	SyncedAt       *time.Time `json:"-"` // 最近一次向渠道主动查询的时间（轮询限频）
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

func (Order) TableName() string { return "payment_orders" }
