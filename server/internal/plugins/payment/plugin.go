// Package payment 支付插件：售卖由其他插件登记的商品（plugincore.ProductProvider），支持线下转账 + 人工确认、
// 支付宝（电脑网站/手机网站支付）、微信支付（APIv3 Native 扫码）与 Stripe Checkout；支付成功后回调商品提供者履约。
//
// 与商品解耦：本插件不认识任何具体商品（如会员），只经 plugincore 的中性扩展点下单与履约。
package payment

import (
	"knowforge/server/internal/authz"
	"knowforge/server/internal/i18ntext"
	"knowforge/server/internal/plugincore"
	"knowforge/server/internal/plugins"
)

// 插件权限（启用时动态注册，禁用即移除）。
const (
	PermOrder  authz.Permission = "payment:order"  // 下单、查看自己的订单
	PermManage authz.Permission = "payment:manage" // 后台订单与支付方式配置（仅管理员）
)

const (
	cfgEnabled       = "payment_enabled"
	notificationType = "payment"
	maxPendingOrders = 10 // 每个用户同时待支付的订单上限
)

func init() {
	plugins.Register(plugins.Meta{
		Order:       100,
		Key:         plugins.KeyPayment,
		Name:        "支付",
		Description: "在线支付：线下转账（人工确认）、支付宝、微信支付与 Stripe。售卖其他插件登记的商品（如会员方案），支付成功后自动履约。默认关闭，禁用后下单与支付页面停用，订单数据保留；已发起的支付回调仍会处理。",
		Kind:        plugins.KindFeature,
		Builtin:     true,
		EnabledKey:  cfgEnabled,
		Models:      []any{&Order{}, &Refund{}},
		Tables:      []string{"payment_refunds", "payment_orders"},
		AdminPerms:  []authz.Permission{PermManage},
		UserPerms:   []authz.Permission{PermOrder},
	})
	plugincore.RegisterBehavior(&behavior{})
	plugincore.RegisterUserDataModels(&Order{}, &Refund{})
	plugincore.OnJobQueueSweep(sweep)
	// 公开站点配置：当前可用的支付方式（商品页据此显示「购买」入口）
	plugincore.RegisterPublicSiteConfig(func(core plugincore.Core) map[string]any {
		channels := []string{}
		if core.PluginEnabled(plugins.KeyPayment) {
			cfg := loadConfig(core)
			for _, ch := range allChannels {
				if ch.Available(cfg, "") {
					channels = append(channels, ch.Key())
				}
			}
		}
		return map[string]any{"payment_channels": channels, plugincore.CheckoutEnabledKey: len(channels) > 0}
	})

	i18ntext.Register("notify.payment.paid", map[string]string{"zh-CN": "支付成功：{title}", "en": "Payment received: {title}"})
	i18ntext.Register("notify.payment.refunded", map[string]string{"zh-CN": "退款成功：{title}，退回 {amount}", "en": "Refunded {amount} for {title}"})
	i18ntext.Register("notify.payment.refundFailed", map[string]string{"zh-CN": "退款未能完成：{title}，我们会尽快处理", "en": "Your refund for {title} could not be completed yet; we are looking into it"})
	i18ntext.Register("notify.payment.refundRejected", map[string]string{"zh-CN": "退款申请未通过：{title}（{note}）", "en": "Refund request declined for {title} ({note})"})
	i18ntext.Register("notify.payment.refundRequested", map[string]string{"zh-CN": "新的退款申请：{title}，{amount}", "en": "New refund request: {title}, {amount}"})
}
