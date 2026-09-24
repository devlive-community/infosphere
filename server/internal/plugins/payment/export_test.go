package payment

import "testing"

// 仅供外部测试包（payment_test）使用：把 Stripe API 指向本地模拟服务。
func SetStripeAPIBase(t *testing.T, base string) {
	old := stripeAPIBase
	stripeAPIBase = base
	t.Cleanup(func() { stripeAPIBase = old })
}
