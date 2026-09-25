package payment

import (
	"fmt"
	"strconv"
	"strings"

	"knowforge/server/internal/plugincore"
)

// config 各支付方式的配置（站点配置键值）。密钥类字段只写不读：管理端只能看到「是否已配置」。
type config struct {
	SiteURL string

	OfflineEnabled     bool
	OfflineInstruction string
	OfflineQR          string
	OfflineExpireHours int

	AlipayEnabled   bool
	AlipayAppID     string
	AlipayPrivate   string // 应用私钥（PKCS#1/PKCS#8，PEM 或纯 Base64）
	AlipayPublicKey string // 支付宝公钥（PEM 或纯 Base64）
	AlipaySandbox   bool

	WechatEnabled     bool
	WechatMchID       string
	WechatAppID       string
	WechatSerialNo    string // 商户 API 证书序列号
	WechatPrivate     string // 商户 API 证书私钥
	WechatAPIv3Key    string // APIv3 密钥（32 字节）
	WechatPublicKey   string // 微信支付公钥
	WechatPublicKeyID string // 微信支付公钥 ID（PUB_KEY_ID_…）

	StripeEnabled       bool
	StripeSecretKey     string
	StripeWebhookSecret string

	RefundRequestDays int // 支付后多少天内用户可申请退款；0 表示不开放用户申请（管理员仍可直接退款）
}

const (
	defaultOfflineExpireHours = 72
	maxOfflineExpireHours     = 24 * 30
	defaultRefundRequestDays  = 7
	maxRefundRequestDays      = 365
)

// intRange 整数配置项的取值范围与越界提示。
func intRange(jsonKey string) (min, max int, msg string) {
	if jsonKey == "refund_request_days" {
		return 0, maxRefundRequestDays, fmt.Sprintf("可申请退款天数需在 0 到 %d 之间（0 为不开放用户申请）", maxRefundRequestDays)
	}
	return 1, maxOfflineExpireHours, fmt.Sprintf("线下转账订单有效期需在 1 到 %d 小时之间", maxOfflineExpireHours)
}

// setting 描述一个配置项：键、是否密钥、读写 config 的方法。
type setting struct {
	json   string
	key    string
	secret bool
	kind   string // str | bool | int
	desc   string
}

var settings = []setting{
	{"offline_enabled", "payment_offline_enabled", false, "bool", "支付：线下转账开关"},
	{"offline_instructions", "payment_offline_instructions", false, "str", "支付：线下转账说明（收款账户等）"},
	{"offline_qr", "payment_offline_qr", false, "str", "支付：线下转账收款码图片地址"},
	{"offline_expire_hours", "payment_offline_expire_hours", false, "int", "支付：线下转账订单有效期（小时）"},
	{"alipay_enabled", "payment_alipay_enabled", false, "bool", "支付：支付宝开关"},
	{"alipay_app_id", "payment_alipay_app_id", false, "str", "支付：支付宝 AppID"},
	{"alipay_private_key", "payment_alipay_private_key", true, "str", "支付：支付宝应用私钥"},
	{"alipay_public_key", "payment_alipay_public_key", true, "str", "支付：支付宝公钥"},
	{"alipay_sandbox", "payment_alipay_sandbox", false, "bool", "支付：支付宝沙箱环境"},
	{"wechat_enabled", "payment_wechat_enabled", false, "bool", "支付：微信支付开关"},
	{"wechat_mch_id", "payment_wechat_mch_id", false, "str", "支付：微信支付商户号"},
	{"wechat_app_id", "payment_wechat_app_id", false, "str", "支付：微信支付关联 AppID"},
	{"wechat_serial_no", "payment_wechat_serial_no", false, "str", "支付：微信支付商户证书序列号"},
	{"wechat_private_key", "payment_wechat_private_key", true, "str", "支付：微信支付商户私钥"},
	{"wechat_api_v3_key", "payment_wechat_api_v3_key", true, "str", "支付：微信支付 APIv3 密钥"},
	{"wechat_public_key", "payment_wechat_public_key", true, "str", "支付：微信支付公钥"},
	{"wechat_public_key_id", "payment_wechat_public_key_id", false, "str", "支付：微信支付公钥 ID"},
	{"stripe_enabled", "payment_stripe_enabled", false, "bool", "支付：Stripe 开关"},
	{"stripe_secret_key", "payment_stripe_secret_key", true, "str", "支付：Stripe Secret Key"},
	{"stripe_webhook_secret", "payment_stripe_webhook_secret", true, "str", "支付：Stripe Webhook 签名密钥"},
	{"refund_request_days", "payment_refund_request_days", false, "int", "支付：支付后可申请退款的天数（0 为不开放用户申请）"},
}

func loadConfig(core plugincore.Core) config {
	get := func(k string) string { return strings.TrimSpace(core.GetSetting(k)) }
	on := func(k string) bool { return get(k) == "true" }
	hours, err := strconv.Atoi(get("payment_offline_expire_hours"))
	if err != nil || hours < 1 || hours > maxOfflineExpireHours {
		hours = defaultOfflineExpireHours
	}
	refundDays, err := strconv.Atoi(get("payment_refund_request_days"))
	if err != nil || refundDays < 0 || refundDays > maxRefundRequestDays {
		refundDays = defaultRefundRequestDays
	}
	return config{
		SiteURL:        strings.TrimRight(get("site_url"), "/"),
		OfflineEnabled: on("payment_offline_enabled"), OfflineInstruction: core.GetSetting("payment_offline_instructions"),
		OfflineQR: get("payment_offline_qr"), OfflineExpireHours: hours,
		AlipayEnabled: on("payment_alipay_enabled"), AlipayAppID: get("payment_alipay_app_id"),
		AlipayPrivate: get("payment_alipay_private_key"), AlipayPublicKey: get("payment_alipay_public_key"), AlipaySandbox: on("payment_alipay_sandbox"),
		WechatEnabled: on("payment_wechat_enabled"), WechatMchID: get("payment_wechat_mch_id"), WechatAppID: get("payment_wechat_app_id"),
		WechatSerialNo: get("payment_wechat_serial_no"), WechatPrivate: get("payment_wechat_private_key"), WechatAPIv3Key: get("payment_wechat_api_v3_key"),
		WechatPublicKey: get("payment_wechat_public_key"), WechatPublicKeyID: get("payment_wechat_public_key_id"),
		StripeEnabled: on("payment_stripe_enabled"), StripeSecretKey: get("payment_stripe_secret_key"), StripeWebhookSecret: get("payment_stripe_webhook_secret"),
		RefundRequestDays: refundDays,
	}
}

// adminView 管理端读取的配置：密钥不返回原文，只返回 <字段>_set 表示是否已配置。
func adminView(core plugincore.Core) map[string]any {
	out := map[string]any{}
	for _, s := range settings {
		raw := strings.TrimSpace(core.GetSetting(s.key))
		switch {
		case s.secret:
			out[s.json+"_set"] = raw != ""
		case s.kind == "bool":
			out[s.json] = raw == "true"
		case s.kind == "int":
			out[s.json], _ = strconv.Atoi(raw)
		default:
			out[s.json] = raw
		}
	}
	if v, _ := out["offline_expire_hours"].(int); v < 1 || v > maxOfflineExpireHours {
		out["offline_expire_hours"] = defaultOfflineExpireHours
	}
	out["refund_request_days"] = loadConfig(core).RefundRequestDays
	return out
}
