// Package paidcontent 付费内容插件：作者为自己的书籍/章节定价，读者购买后解锁全文；平台按比例抽成，作者收益入账后申请提现，
// 管理员线下打款确认。
//
//   - 访问控制经 plugincore.RegisterContentGate 接入核心所有内容出口（阅读、导出、搜索摘要…），未解锁时只给试读内容；
//   - 售卖经 plugincore 商品提供者（paid-book / paid-doc）由支付插件完成，本插件不感知支付方式；
//   - 与会员/等级结合全部通过权益：「内容访问等级」（书籍可设 ≥ 某等级免费）、「购买折扣」「全部付费内容免费」，
//     由会员方案或成长等级在各自的权益编辑器中授予，本插件不认识会员与等级。
package paidcontent

import (
	"strconv"

	"knowforge/server/internal/authz"
	"knowforge/server/internal/i18ntext"
	"knowforge/server/internal/plugincore"
	"knowforge/server/internal/plugins"
)

// 插件权限（启用时动态注册，禁用即移除）。
const (
	PermUse    authz.Permission = "paid:use"    // 为自己的书定价、购买、查看收益与申请提现
	PermManage authz.Permission = "paid:manage" // 后台销售、提现审核与设置（仅管理员）
)

// 权益键。
const (
	entAccessTier = "content.access_tier"      // 内容访问等级（书籍可设「≥ 某等级免费」）
	entDiscount   = "content.discount_percent" // 购买付费内容的折扣（百分比）
	entFreeAll    = "content.free_all"         // 全部付费内容免费
)

const (
	cfgEnabled = "paid_enabled"
	maxTier    = 100
	maxDisc    = 90
)

func init() {
	plugins.Register(plugins.Meta{
		Order:       105,
		Key:         plugins.KeyPaidContent,
		Name:        "付费内容",
		Description: "付费书籍与付费章节：作者定价（整本/章节、免费试读章节与试读比例），读者购买后解锁；平台按比例抽成，作者收益可申请提现（管理员线下打款确认）。可与会员/等级结合：内容访问等级免费读、购买折扣、全部付费内容免费。购买需配合支付插件。默认关闭。",
		Kind:        plugins.KindFeature,
		Builtin:     true,
		EnabledKey:  cfgEnabled,
		Models:      []any{&PaidBook{}, &PaidDoc{}, &Purchase{}, &LedgerEntry{}, &Withdrawal{}},
		Tables:      []string{"paid_withdrawals", "paid_ledger_entries", "paid_purchases", "paid_docs", "paid_books"},
		AdminPerms:  []authz.Permission{PermManage},
		UserPerms:   []authz.Permission{PermUse},
	})
	plugincore.RegisterBehavior(&behavior{})
	plugincore.RegisterUserDataModels(&Purchase{})
	plugincore.RegisterContentGate(plugincore.ContentGate{Document: gateDocument, BookFully: gateBookFully})
	plugincore.RegisterProductProvider(plugincore.ProductProvider{Kind: kindBook, Resolve: resolveBook, Fulfill: fulfill})
	plugincore.RegisterProductProvider(plugincore.ProductProvider{Kind: kindDoc, Resolve: resolveDoc, Fulfill: fulfill})

	available := func(core plugincore.Core) bool { return core.PluginEnabled(plugins.KeyPaidContent) }
	limit := func(key, unit, cfg string, max int64, order int) plugincore.EntitlementDef {
		return plugincore.EntitlementDef{
			Key: key, Kind: plugincore.EntitlementLimit, Unit: unit, Min: 0, Max: max, Order: order, Available: available,
			Base: func(core plugincore.Core) int64 {
				v, _ := strconv.ParseInt(core.GetSetting(cfg), 10, 64)
				if v < 0 || v > max {
					return 0
				}
				return v
			},
			SetBase: func(core plugincore.Core, v int64) error {
				return core.SetSetting(cfg, strconv.FormatInt(v, 10), "付费内容：权益基础值 "+key)
			},
		}
	}
	plugincore.RegisterEntitlement(limit(entAccessTier, "tier", "paid_base_access_tier", maxTier, 70))
	plugincore.RegisterEntitlement(limit(entDiscount, "percent", "paid_base_discount", maxDisc, 71))
	plugincore.RegisterEntitlement(plugincore.EntitlementDef{
		Key: entFreeAll, Kind: plugincore.EntitlementFlag, Min: 0, Max: 1, Order: 72, Available: available,
		Base: func(core plugincore.Core) int64 {
			if core.GetSetting("paid_base_free_all") == "true" {
				return 1
			}
			return 0
		},
		SetBase: func(core plugincore.Core, v int64) error {
			return core.SetSetting("paid_base_free_all", strconv.FormatBool(v == 1), "付费内容：全部付费内容免费（基础）")
		},
	})

	i18ntext.Register("notify.paid.sold", map[string]string{"zh-CN": "《{book}》售出：{title}，收益 {amount}", "en": `Sale in "{book}": {title}, earning {amount}`})
	i18ntext.Register("notify.paid.withdrawalPaid", map[string]string{"zh-CN": "提现 {amount} 已打款", "en": "Your withdrawal of {amount} has been paid"})
	i18ntext.Register("notify.paid.withdrawalRejected", map[string]string{"zh-CN": "提现 {amount} 未通过：{note}", "en": "Your withdrawal of {amount} was declined: {note}"})
}
