package membership

import (
	"errors"
	"fmt"
	"strconv"
	"time"

	"gorm.io/gorm"

	"knowforge/server/internal/models"
	"knowforge/server/internal/plugincore"
	"knowforge/server/internal/plugins"
)

// 在线购买：把方案的每档价格登记为可售商品（kind=membership，SKU=价格 ID），由支付插件经 plugincore 下单与回调履约；
// 本插件不感知具体支付方式。

const (
	productKind = "membership"
	orderSource = "order"
)

func init() {
	plugincore.RegisterProductProvider(plugincore.ProductProvider{Kind: productKind, Resolve: resolveProduct, Fulfill: fulfillOrder})
}

// resolveProduct 按价格 ID 解析可购买的会员商品（方案须启用中）。
func resolveProduct(core plugincore.Core, _ *models.User, sku string) (plugincore.Product, error) {
	if !core.PluginEnabled(plugins.KeyMembership) {
		return plugincore.Product{}, errors.New("会员功能未启用")
	}
	id, err := strconv.ParseUint(sku, 10, 64)
	if err != nil {
		return plugincore.Product{}, errors.New("商品不存在")
	}
	var price Price
	var plan Plan
	db := core.Gorm()
	if db.First(&price, id).Error != nil || db.First(&plan, price.PlanID).Error != nil {
		return plugincore.Product{}, errors.New("商品不存在")
	}
	if plan.Status != "active" {
		return plugincore.Product{}, errPlanArchived
	}
	b := &behavior{core: core}
	return plugincore.Product{
		Kind: productKind, SKU: sku, Title: plan.Name, Description: plan.Description, DurationDays: price.DurationDays,
		AmountCents: price.PriceCents, Currency: b.currency(), ReturnLink: notificationLink,
		Payload: map[string]any{"plan_id": plan.ID, "price_id": price.ID, "days": price.DurationDays},
	}, nil
}

// fulfillOrder 订单支付成功后开通/续期（按订单号幂等：已有该订单的会员流水则跳过）。
func fulfillOrder(core plugincore.Core, userID uint, orderNo string, payload map[string]any) error {
	planID, days := payloadInt(payload["plan_id"]), payloadInt(payload["days"])
	if planID <= 0 || days <= 0 {
		return fmt.Errorf("订单 %s 的会员快照无效", orderNo)
	}
	var (
		m      UserMembership
		plan   Plan
		action string
		done   bool
	)
	err := core.Gorm().Transaction(func(tx *gorm.DB) error {
		var n int64
		tx.Model(&Record{}).Where("source = ? AND source_ref = ?", orderSource, orderNo).Count(&n)
		if n > 0 {
			done = true
			return nil
		}
		var err error
		m, plan, action, err = applyGrant(tx, grant{UserID: userID, PlanID: uint(planID), Days: int(days), Source: orderSource, SourceRef: orderNo,
			Reason: orderNo, AllowArchived: true}, time.Now())
		return err
	})
	if err != nil || done {
		return err
	}
	(&behavior{core: core}).notifyChange(userID, plan, action, m.ExpiresAt)
	return nil
}

// payloadInt 读取快照中的整数（JSON 往返后为 float64）。
func payloadInt(v any) int64 {
	switch n := v.(type) {
	case float64:
		return int64(n)
	case int:
		return int64(n)
	case int64:
		return n
	case uint:
		return int64(n)
	case string:
		i, _ := strconv.ParseInt(n, 10, 64)
		return i
	}
	return 0
}
