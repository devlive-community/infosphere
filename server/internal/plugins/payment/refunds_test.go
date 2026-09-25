package payment

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

// 渠道退款的单元测试：模拟各渠道的退款与退款查询接口（含签名/验签、幂等键、状态映射）。

func testRefund() *Refund {
	return &Refund{RefundNo: "R2026092412000087654321", AmountCents: 900, Currency: "CNY", Reason: "不想要了"}
}

func TestAlipayRefundAndQuery(t *testing.T) {
	key, priv, pub := testKeys(t)
	cfg := config{AlipayEnabled: true, AlipayAppID: "app", AlipayPrivate: priv, AlipayPublicKey: pub}
	var calls []url.Values
	fundChange, queryHit := "Y", true
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		q, _ := url.ParseQuery(string(body))
		if !verifySHA256(&key.PublicKey, alipaySignContent(q, false), q.Get("sign")) {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		calls = append(calls, q)
		method := q.Get("method")
		raw := fmt.Sprintf(`{"code":"10000","msg":"Success","trade_no":"T1","fund_change":"%s","refund_fee":"9.00"}`, fundChange)
		if method == "alipay.trade.fastpay.refund.query" {
			raw = `{"code":"10000","msg":"Success"}`
			if queryHit {
				raw = `{"code":"10000","msg":"Success","trade_no":"T1","out_request_no":"R2026092412000087654321","refund_amount":"9.00"}`
			}
		}
		node := strings.ReplaceAll(method, ".", "_") + "_response"
		sign, _ := signSHA256(key, raw)
		_, _ = w.Write([]byte(`{"` + node + `":` + raw + `,"sign":"` + sign + `"}`))
	}))
	defer srv.Close()
	alipayGatewayOverride = srv.URL
	defer func() { alipayGatewayOverride = "" }()

	in := refundInput{Order: testOrder(), Refund: testRefund(), Cfg: cfg}
	res, err := alipayChannel{}.Refund(context.Background(), in)
	if err != nil || res.Status != RefundSucceeded || res.ChannelRefundID != "T1" {
		t.Fatalf("fund_change=Y 应为已退款: %v %+v", err, res)
	}
	biz := calls[0].Get("biz_content")
	if calls[0].Get("method") != "alipay.trade.refund" || !strings.Contains(biz, `"refund_amount":"9.00"`) || !strings.Contains(biz, `"out_request_no":"R2026092412000087654321"`) {
		t.Fatalf("退款参数错误: %v", calls[0])
	}
	// fund_change=N（如重复请求）：以查询确认
	fundChange, calls = "N", nil
	if res, err := (alipayChannel{}).Refund(context.Background(), in); err != nil || res.Status != RefundSucceeded || len(calls) != 2 {
		t.Fatalf("fund_change=N 时应查询确认: %v %+v %d", err, res, len(calls))
	}
	// 查询不到该退款请求：未退款
	queryHit = false
	if res, err := (alipayChannel{}).QueryRefund(context.Background(), in); err != nil || res.Status != RefundFailed {
		t.Fatalf("查询不到退款应视为未退款: %v %+v", err, res)
	}
}

func TestWechatRefundStatuses(t *testing.T) {
	cfg, key := wechatConfig(t)
	status := "PROCESSING"
	var posted map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.Header.Get("Authorization"), "WECHATPAY2-SHA256-RSA2048 ") {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/R-missing") {
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"code":"RESOURCE_NOT_EXISTS","message":"退款单不存在"}`))
			return
		}
		if r.Method == http.MethodPost {
			_ = json.NewDecoder(r.Body).Decode(&posted)
		}
		resp := fmt.Sprintf(`{"refund_id":"5030","out_refund_no":"R2026092412000087654321","status":"%s","amount":{"refund":900}}`, status)
		wechatSign(t, key, w.Header(), resp, time.Now())
		_, _ = w.Write([]byte(resp))
	}))
	defer srv.Close()
	old := wechatAPIBase
	wechatAPIBase = srv.URL
	defer func() { wechatAPIBase = old }()

	in := refundInput{Order: testOrder(), Refund: testRefund(), Cfg: cfg}
	res, err := wechatChannel{}.Refund(context.Background(), in)
	if err != nil || res.Status != RefundProcessing || res.ChannelRefundID != "5030" {
		t.Fatalf("受理中应返回 processing: %v %+v", err, res)
	}
	amount := posted["amount"].(map[string]any)
	if posted["out_refund_no"] != "R2026092412000087654321" || amount["refund"].(float64) != 900 || amount["total"].(float64) != 1900 {
		t.Fatalf("退款请求参数错误: %v", posted)
	}
	status = "SUCCESS"
	if res, err := (wechatChannel{}).QueryRefund(context.Background(), in); err != nil || res.Status != RefundSucceeded {
		t.Fatalf("SUCCESS 应为已退款: %v %+v", err, res)
	}
	status = "ABNORMAL"
	if res, _ := (wechatChannel{}).QueryRefund(context.Background(), in); res.Status != RefundFailed || res.Error == "" {
		t.Fatalf("ABNORMAL 应为失败: %+v", res)
	}
	missing := refundInput{Order: testOrder(), Refund: &Refund{RefundNo: "R-missing", AmountCents: 900}, Cfg: cfg}
	if res, err := (wechatChannel{}).QueryRefund(context.Background(), missing); err != nil || res.Status != RefundFailed {
		t.Fatalf("退款单不存在应为未退款: %v %+v", err, res)
	}
}

func TestStripeRefundIdempotencyAndLookup(t *testing.T) {
	cfg := config{StripeEnabled: true, StripeSecretKey: "sk_test_x", StripeWebhookSecret: "whsec"}
	var idem string
	var form url.Values
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/refunds":
			idem = r.Header.Get("Idempotency-Key")
			body, _ := io.ReadAll(r.Body)
			form, _ = url.ParseQuery(string(body))
			_, _ = w.Write([]byte(`{"id":"re_1","status":"pending","amount":9}`))
		case r.Method == http.MethodGet && r.URL.Path == "/v1/refunds/re_1":
			_, _ = w.Write([]byte(`{"id":"re_1","status":"succeeded","amount":9}`))
		case r.Method == http.MethodGet && r.URL.Path == "/v1/refunds":
			_, _ = w.Write([]byte(`{"data":[{"id":"re_0","status":"succeeded","metadata":{"refund_no":"other"}},{"id":"re_1","status":"failed","failure_reason":"expired_or_canceled_card","metadata":{"refund_no":"R2026092412000087654321"}}]}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()
	old := stripeAPIBase
	stripeAPIBase = srv.URL
	defer func() { stripeAPIBase = old }()

	o := testOrder()
	o.Currency, o.AmountCents, o.ChannelTradeNo = "JPY", 150000, "pi_1"
	r := testRefund()
	r.AmountCents = 90000 // 900 日元
	in := refundInput{Order: o, Refund: r, Cfg: cfg}
	res, err := stripeChannel{}.Refund(context.Background(), in)
	if err != nil || res.Status != RefundProcessing || res.ChannelRefundID != "re_1" {
		t.Fatalf("pending 应为受理中: %v %+v", err, res)
	}
	if idem != r.RefundNo || form.Get("payment_intent") != "pi_1" || form.Get("amount") != "900" {
		t.Fatalf("应以退款单号作幂等键并按零小数位货币换算: %q %v", idem, form)
	}
	r.ChannelRefundID = "re_1"
	if res, _ := (stripeChannel{}).QueryRefund(context.Background(), in); res.Status != RefundSucceeded {
		t.Fatalf("查询应为已退款: %+v", res)
	}
	// 发起结果未知（未拿到退款 ID）：按 PaymentIntent 列出并以 metadata 匹配
	r.ChannelRefundID = ""
	if res, _ := (stripeChannel{}).QueryRefund(context.Background(), in); res.Status != RefundFailed || !strings.Contains(res.Error, "expired_or_canceled_card") {
		t.Fatalf("应匹配到本次退款并映射为失败: %+v", res)
	}
	o.ChannelTradeNo = "cs_test_1"
	if _, err := (stripeChannel{}).Refund(context.Background(), in); err == nil {
		t.Fatal("缺少 PaymentIntent 时不能在线退款")
	}
}

func TestAmbiguousErrors(t *testing.T) {
	if !ambiguous(&url.Error{Op: "Post", URL: "https://x", Err: errors.New("connection reset")}) || !ambiguous(context.DeadlineExceeded) {
		t.Fatal("网络错误与超时应视为结果未知")
	}
	if ambiguous(errors.New("支付宝退款失败：ACQ.TRADE_HAS_FINISHED")) {
		t.Fatal("渠道明确拒绝不属于结果未知")
	}
}
