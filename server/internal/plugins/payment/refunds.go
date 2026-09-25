package payment

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/url"
	"time"

	"gorm.io/gorm"

	"knowforge/server/internal/models"
	"knowforge/server/internal/plugincore"
)

// 退款：用户在可申请期内提交申请、管理员审核（可调整金额、选择是否撤销商品）后向渠道发起；管理员也可直接退款。
// 支持部分退款。额度以订单上的 refund_committed_cents 原子占用（条件更新），任何数据库下都不会超额退款。
// 渠道受理中的退款在查看时（限频）与巡检时查询结果；退款成功后回调商品提供者冲回财务并按需撤销商品（按退款单号幂等，失败由巡检重试）。

const refundAdminLink = "/admin/payment?tab=refunds"

func newRefundNo() string { return "R" + newOrderNo() }

// reserveRefund 原子占用退款额度：只对已支付订单、且占用后不超过订单金额时成功。
func reserveRefund(db *gorm.DB, orderID uint, amount int64) bool {
	res := db.Model(&Order{}).Where("id = ? AND status = ? AND refund_committed_cents + ? <= amount_cents", orderID, StatusPaid, amount).
		UpdateColumn("refund_committed_cents", gorm.Expr("refund_committed_cents + ?", amount))
	return res.Error == nil && res.RowsAffected == 1
}

func releaseRefund(db *gorm.DB, orderID uint, amount int64) {
	db.Model(&Order{}).Where("id = ?", orderID).UpdateColumn("refund_committed_cents", gorm.Expr("refund_committed_cents - ?", amount))
}

// refundableCents 订单尚可退款的金额。
func refundableCents(o *Order) int64 {
	if o.Status != StatusPaid {
		return 0
	}
	return o.AmountCents - o.RefundCommittedCents
}

func formatAmount(cents int64, currency string) string {
	return fmt.Sprintf("%d.%02d %s", cents/100, cents%100, currency)
}

// canRequestRefund 用户能否对订单申请退款（返回不可申请的原因）。
func (b *behavior) canRequestRefund(o *Order) error {
	cfg := loadConfig(b.core)
	switch {
	case o.Status != StatusPaid || o.PaidAt == nil:
		return errors.New("只有已支付的订单可以申请退款")
	case cfg.RefundRequestDays <= 0:
		return errors.New("本站暂不开放在线申请退款，请联系管理员")
	case time.Since(*o.PaidAt) > time.Duration(cfg.RefundRequestDays)*24*time.Hour:
		return fmt.Errorf("已超过可申请退款的期限（支付后 %d 天内）", cfg.RefundRequestDays)
	case refundableCents(o) <= 0:
		return errors.New("该订单已无可退款金额")
	}
	var open int64
	b.core.Gorm().Model(&Refund{}).Where("order_id = ? AND status IN ?", o.ID, []string{RefundRequested, RefundPending, RefundProcessing}).Count(&open)
	if open > 0 {
		return errors.New("该订单已有处理中的退款")
	}
	return nil
}

// requestRefund 用户申请退款：占用剩余可退金额，等待管理员审核。
func (b *behavior) requestRefund(u *models.User, o *Order, reason string) (*Refund, error) {
	if err := b.canRequestRefund(o); err != nil {
		return nil, err
	}
	amount := refundableCents(o)
	db := b.core.Gorm()
	if !reserveRefund(db, o.ID, amount) {
		return nil, errors.New("订单状态已变化，请刷新后重试")
	}
	r := &Refund{RefundNo: newRefundNo(), OrderID: o.ID, OrderNo: o.OrderNo, UserID: o.UserID, AmountCents: amount, Currency: o.Currency,
		Channel: o.Channel, Reason: truncateRunes(reason, 500), Revoke: true, Status: RefundRequested, RequestedBy: u.ID}
	if err := db.Create(r).Error; err != nil {
		releaseRefund(db, o.ID, amount)
		return nil, err
	}
	b.notifyAdmins("notify.payment.refundRequested", map[string]string{"title": o.Title, "amount": formatAmount(amount, o.Currency)})
	return r, nil
}

// createRefund 管理员直接发起退款（跳过申请），随即向渠道发起。
func (b *behavior) createRefund(ctx context.Context, admin *models.User, o *Order, amount int64, reason string, revoke bool) (*Refund, error) {
	if amount <= 0 || amount > refundableCents(o) {
		return nil, fmt.Errorf("退款金额需在 0.01 到 %s 之间", formatAmount(refundableCents(o), o.Currency))
	}
	db := b.core.Gorm()
	if !reserveRefund(db, o.ID, amount) {
		return nil, errors.New("订单状态已变化或可退金额不足，请刷新后重试")
	}
	r := &Refund{RefundNo: newRefundNo(), OrderID: o.ID, OrderNo: o.OrderNo, UserID: o.UserID, AmountCents: amount, Currency: o.Currency,
		Channel: o.Channel, Reason: truncateRunes(reason, 500), Revoke: revoke, Status: RefundPending, RequestedBy: admin.ID, ReviewedBy: admin.ID}
	if err := db.Create(r).Error; err != nil {
		releaseRefund(db, o.ID, amount)
		return nil, err
	}
	b.execute(ctx, r)
	return r, nil
}

// approveRefund 审核通过用户的申请（可下调金额、选择是否撤销商品），随即向渠道发起。
func (b *behavior) approveRefund(ctx context.Context, admin *models.User, r *Refund, amount int64, revoke bool, note string) error {
	if r.Status != RefundRequested {
		return errors.New("该退款不在待审核状态")
	}
	if amount <= 0 || amount > r.AmountCents {
		return fmt.Errorf("退款金额需在 0.01 到 %s 之间（不超过申请金额）", formatAmount(r.AmountCents, r.Currency))
	}
	db := b.core.Gorm()
	res := db.Model(&Refund{}).Where("id = ? AND status = ?", r.ID, RefundRequested).Updates(map[string]any{
		"status": RefundPending, "amount_cents": amount, "revoke": revoke, "reviewed_by": admin.ID, "admin_note": truncateRunes(note, 500),
	})
	if res.RowsAffected != 1 {
		return errors.New("该退款状态已变化")
	}
	if amount < r.AmountCents {
		releaseRefund(db, r.OrderID, r.AmountCents-amount)
	}
	db.First(r, r.ID)
	b.execute(ctx, r)
	return nil
}

// rejectRefund 驳回申请：释放占用的额度并通知用户。
func (b *behavior) rejectRefund(admin *models.User, r *Refund, note string) error {
	db := b.core.Gorm()
	res := db.Model(&Refund{}).Where("id = ? AND status = ?", r.ID, RefundRequested).Updates(map[string]any{
		"status": RefundRejected, "reviewed_by": admin.ID, "admin_note": truncateRunes(note, 500),
	})
	if res.RowsAffected != 1 {
		return errors.New("该退款不在待审核状态")
	}
	releaseRefund(db, r.OrderID, r.AmountCents)
	var o Order
	db.First(&o, r.OrderID)
	b.core.NotifyI18n(r.UserID, notificationType, "notify.payment.refundRejected", map[string]string{"title": o.Title, "note": note},
		map[string]any{"link": "/pay/orders/" + o.OrderNo})
	return nil
}

// execute 向渠道发起退款并按结果推进状态。
func (b *behavior) execute(ctx context.Context, r *Refund) {
	db := b.core.Gorm()
	var o Order
	if db.First(&o, r.OrderID).Error != nil {
		b.fail(r, "订单不存在")
		return
	}
	ch, found := channelFor(r.Channel)
	if !found {
		b.fail(r, "支付方式不存在")
		return
	}
	res, err := ch.Refund(ctx, refundInput{Order: &o, Refund: r, Cfg: loadConfig(b.core)})
	if err != nil {
		if ambiguous(err) {
			// 请求可能已到达渠道：不能判定失败（否则可能重复退款），置为受理中，由查询确认结果
			db.Model(&Refund{}).Where("id = ? AND status = ?", r.ID, RefundPending).
				Updates(map[string]any{"status": RefundProcessing, "error": truncateRunes("结果未知，正在向渠道确认："+err.Error(), 500)})
			db.First(r, r.ID)
			return
		}
		b.fail(r, err.Error())
		return
	}
	b.apply(r, res)
}

// ambiguous 错误是否意味着结果未知（网络中断、超时：请求可能已被渠道受理）。渠道明确拒绝的错误不属于此类。
func ambiguous(err error) bool {
	var ue *url.Error
	return errors.As(err, &ue) || errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled)
}

// resolveRefund 管理员人工确认受理中的退款结果（渠道无法给出结果时，在商户后台核实后操作）。
func (b *behavior) resolveRefund(r *Refund, succeeded bool, note string) error {
	if r.Status != RefundProcessing {
		return errors.New("只有受理中的退款可以人工确认")
	}
	if succeeded {
		b.succeed(r, r.ChannelRefundID)
	} else {
		b.fail(r, firstNonEmpty(note, "管理员确认渠道未退款"))
	}
	if r.Status == RefundProcessing {
		return errors.New("该退款状态已变化")
	}
	return nil
}

// apply 按渠道结果推进：成功 → 入账并回调商品提供者；失败 → 释放额度；受理中 → 等待查询。
func (b *behavior) apply(r *Refund, res refundResult) {
	db := b.core.Gorm()
	switch res.Status {
	case RefundSucceeded:
		b.succeed(r, res.ChannelRefundID)
	case RefundFailed:
		b.fail(r, res.Error)
	default:
		db.Model(&Refund{}).Where("id = ? AND status IN ?", r.ID, []string{RefundPending, RefundProcessing}).
			Updates(map[string]any{"status": RefundProcessing, "channel_refund_id": truncateRunes(firstNonEmpty(res.ChannelRefundID, r.ChannelRefundID), 128)})
	}
	db.First(r, r.ID)
}

func (b *behavior) fail(r *Refund, msg string) {
	db := b.core.Gorm()
	res := db.Model(&Refund{}).Where("id = ? AND status IN ?", r.ID, []string{RefundPending, RefundProcessing}).
		Updates(map[string]any{"status": RefundFailed, "error": truncateRunes(msg, 500)})
	if res.RowsAffected != 1 {
		return
	}
	releaseRefund(db, r.OrderID, r.AmountCents)
	log.Printf("[payment] 退款 %s 失败: %s", r.RefundNo, msg)
	if r.RequestedBy == r.UserID { // 用户申请的退款失败时告知用户
		var o Order
		db.First(&o, r.OrderID)
		b.core.NotifyI18n(r.UserID, notificationType, "notify.payment.refundFailed", map[string]string{"title": o.Title},
			map[string]any{"link": "/pay/orders/" + o.OrderNo})
	}
	db.First(r, r.ID)
}

// succeed 退款成功：记入订单已退金额（全额退款时订单置为已退款），通知用户，回调商品提供者。
func (b *behavior) succeed(r *Refund, channelRefundID string) {
	db := b.core.Gorm()
	now := time.Now()
	var o Order
	err := db.Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&Refund{}).Where("id = ? AND status IN ?", r.ID, []string{RefundPending, RefundProcessing}).Updates(map[string]any{
			"status": RefundSucceeded, "succeeded_at": now, "channel_refund_id": truncateRunes(firstNonEmpty(channelRefundID, r.ChannelRefundID), 128), "error": "",
		})
		if res.Error != nil || res.RowsAffected != 1 {
			return errors.New("skip")
		}
		if err := tx.Model(&Order{}).Where("id = ?", r.OrderID).UpdateColumn("refunded_cents", gorm.Expr("refunded_cents + ?", r.AmountCents)).Error; err != nil {
			return err
		}
		return tx.Model(&Order{}).Where("id = ? AND status = ? AND refunded_cents >= amount_cents", r.OrderID, StatusPaid).Update("status", StatusRefunded).Error
	})
	if err != nil {
		return
	}
	db.First(&o, r.OrderID)
	db.First(r, r.ID)
	b.core.NotifyI18n(r.UserID, notificationType, "notify.payment.refunded", map[string]string{"title": o.Title, "amount": formatAmount(r.AmountCents, r.Currency)},
		map[string]any{"link": "/pay/orders/" + o.OrderNo})
	b.settle(r, &o)
}

// settle 回调商品提供者（冲回财务、按需撤销商品）；按退款单号幂等，失败记录错误由巡检重试。
func (b *behavior) settle(r *Refund, o *Order) {
	if r.Status != RefundSucceeded || r.SettledAt != nil {
		return
	}
	db := b.core.Gorm()
	var err error
	if provider, found := plugincore.ProductProviderFor(o.Kind); !found {
		err = fmt.Errorf("商品类型 %s 未登记（对应插件未加载）", o.Kind)
	} else if provider.Refund != nil {
		payload := map[string]any{}
		_ = json.Unmarshal([]byte(o.Payload), &payload)
		err = provider.Refund(b.core, plugincore.RefundEvent{UserID: o.UserID, OrderNo: o.OrderNo, RefundNo: r.RefundNo,
			AmountCents: r.AmountCents, TotalCents: o.AmountCents, Currency: o.Currency, Revoke: r.Revoke, Payload: payload})
	}
	if err != nil {
		db.Model(&Refund{}).Where("id = ?", r.ID).Update("settle_error", truncateRunes(err.Error(), 500))
		log.Printf("[payment] 退款 %s 回调商品提供者失败: %v", r.RefundNo, err)
		return
	}
	now := time.Now()
	db.Model(&Refund{}).Where("id = ?", r.ID).Updates(map[string]any{"settled_at": now, "settle_error": ""})
	r.SettledAt, r.SettleError = &now, ""
}

// syncRefund 受理中的退款向渠道查询结果（限频）。
func (b *behavior) syncRefund(ctx context.Context, r *Refund) {
	if r.Status != RefundProcessing || (r.SyncedAt != nil && time.Since(*r.SyncedAt) < syncInterval) {
		return
	}
	db := b.core.Gorm()
	now := time.Now()
	db.Model(&Refund{}).Where("id = ?", r.ID).Update("synced_at", now)
	var o Order
	ch, found := channelFor(r.Channel)
	if !found || db.First(&o, r.OrderID).Error != nil {
		return
	}
	res, err := ch.QueryRefund(ctx, refundInput{Order: &o, Refund: r, Cfg: loadConfig(b.core)})
	if err != nil {
		log.Printf("[payment] 查询退款 %s 失败: %v", r.RefundNo, err)
		return
	}
	b.apply(r, res)
}

// sweepRefunds 巡检：查询受理中的退款；重试已成功但未回调商品提供者的退款。
func (b *behavior) sweepRefunds(ctx context.Context) {
	db := b.core.Gorm()
	if !db.Migrator().HasTable(&Refund{}) {
		return
	}
	var processing []Refund
	db.Where("status = ?", RefundProcessing).Limit(50).Find(&processing)
	for i := range processing {
		b.syncRefund(ctx, &processing[i])
	}
	var unsettled []Refund
	db.Where("status = ? AND settled_at IS NULL", RefundSucceeded).Limit(50).Find(&unsettled)
	for i := range unsettled {
		var o Order
		if db.First(&o, unsettled[i].OrderID).Error == nil {
			b.settle(&unsettled[i], &o)
		}
	}
}

// notifyAdmins 通知所有启用中的管理员（如新的退款申请）。
func (b *behavior) notifyAdmins(key string, params map[string]string) {
	var admins []models.User
	b.core.Gorm().Select("id").Where("role = ? AND is_active = ?", "admin", true).Find(&admins)
	for _, a := range admins {
		b.core.NotifyI18n(a.ID, notificationType, key, params, map[string]any{"link": refundAdminLink})
	}
}

// refundsOf 订单的退款记录（新→旧）。
func (b *behavior) refundsOf(orderID uint) []Refund {
	var list []Refund
	b.core.Gorm().Where("order_id = ?", orderID).Order("id DESC").Find(&list)
	return list
}
