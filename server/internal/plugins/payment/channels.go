package payment

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// 支付方式键。
const (
	chOffline = "offline"
	chAlipay  = "alipay"
	chWechat  = "wechat"
	chStripe  = "stripe"
)

var httpClient = &http.Client{Timeout: 15 * time.Second}

// createInput 发起支付所需的上下文。
type createInput struct {
	Order   *Order
	Cfg     config
	BaseURL string // 站点地址（拼接回调与返回地址）
	Mobile  bool   // 移动端（支付宝走手机网站支付）
}

// action 下单后前端要执行的动作。
type action struct {
	Type         string `json:"type"`                   // redirect | qrcode | offline
	URL          string `json:"url,omitempty"`          // redirect：跳转地址
	QR           string `json:"qr,omitempty"`           // qrcode：二维码图片（data URI）
	Instructions string `json:"instructions,omitempty"` // offline：转账说明
	QRImage      string `json:"qr_image,omitempty"`     // offline：收款码图片地址
}

// paidResult 渠道确认的支付成功结果（金额以最小货币单位计）。
type paidResult struct {
	OrderNo     string
	TradeNo     string
	AmountCents int64
	Currency    string
}

// notifyReply 给渠道异步通知的应答。
type notifyReply struct {
	Status      int
	ContentType string
	Body        string
}

// channel 一种支付方式。
type channel interface {
	Key() string
	// Available 已启用且配置完整、支持该货币（currency 为空时不校验货币）。
	Available(cfg config, currency string) bool
	// Create 向渠道发起支付，返回渠道侧引用（写入 Order.ChannelRef）与前端动作。
	Create(ctx context.Context, in createInput) (ref string, act action, err error)
	// Resume 待支付订单再次打开时的前端动作（重新展示二维码/跳转地址）。
	Resume(in createInput) (action, error)
	// Query 主动查询支付结果；未支付返回 nil。
	Query(ctx context.Context, cfg config, o *Order) (*paidResult, error)
	// Notify 校验并解析异步通知；返回的结果为 nil 表示与支付成功无关的通知（仍按 reply 应答）。
	Notify(cfg config, r *http.Request, body []byte) (*paidResult, notifyReply, error)
}

var allChannels = []channel{offlineChannel{}, alipayChannel{}, wechatChannel{}, stripeChannel{}}

func channelFor(key string) (channel, bool) {
	for _, ch := range allChannels {
		if ch.Key() == key {
			return ch, true
		}
	}
	return nil, false
}

var errNotSupported = errors.New("该支付方式不支持此操作")

// formatYuan 分 → 「12.34」（支付宝金额格式）。
func formatYuan(cents int64) string { return fmt.Sprintf("%d.%02d", cents/100, cents%100) }

// parseYuan 「12.34」→ 分；格式不合法返回 -1。
func parseYuan(s string) int64 {
	s = strings.TrimSpace(s)
	whole, frac, _ := strings.Cut(s, ".")
	if whole == "" || len(frac) > 2 {
		return -1
	}
	for len(frac) < 2 {
		frac += "0"
	}
	var cents int64
	for _, r := range whole + frac {
		if r < '0' || r > '9' {
			return -1
		}
		cents = cents*10 + int64(r-'0')
	}
	return cents
}

// —— 线下转账：展示收款说明，由管理员确认到账后标记已支付 ——

type offlineChannel struct{}

func (offlineChannel) Key() string { return chOffline }

func (offlineChannel) Available(cfg config, _ string) bool {
	return cfg.OfflineEnabled && (strings.TrimSpace(cfg.OfflineInstruction) != "" || cfg.OfflineQR != "")
}

func (c offlineChannel) Create(_ context.Context, in createInput) (string, action, error) {
	act, err := c.Resume(in)
	return "", act, err
}

func (offlineChannel) Resume(in createInput) (action, error) {
	return action{Type: "offline", Instructions: in.Cfg.OfflineInstruction, QRImage: in.Cfg.OfflineQR}, nil
}

func (offlineChannel) Query(context.Context, config, *Order) (*paidResult, error) { return nil, nil }

func (offlineChannel) Notify(config, *http.Request, []byte) (*paidResult, notifyReply, error) {
	return nil, notifyReply{Status: http.StatusNotFound}, errNotSupported
}
