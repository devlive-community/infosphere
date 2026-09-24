package payment

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Stripe Checkout：创建 Checkout Session 并跳转 Stripe 收银台；Webhook（checkout.session.completed /
// async_payment_succeeded）以签名密钥 HMAC 验签后履约；轮询时读取 Session 状态。支持 Stripe 支持的任意货币。

var stripeAPIBase = "https://api.stripe.com" // 测试可替换

const stripeTolerance = 5 * time.Minute

// Stripe 的零小数位货币：金额以主单位计（本系统统一存「分」，需换算）。
var stripeZeroDecimal = map[string]bool{
	"BIF": true, "CLP": true, "DJF": true, "GNF": true, "JPY": true, "KMF": true, "KRW": true, "MGA": true,
	"PYG": true, "RWF": true, "UGX": true, "VND": true, "VUV": true, "XAF": true, "XOF": true, "XPF": true,
}

func stripeAmount(cents int64, currency string) int64 {
	if stripeZeroDecimal[strings.ToUpper(currency)] {
		return cents / 100
	}
	return cents
}

func fromStripeAmount(amount int64, currency string) int64 {
	if stripeZeroDecimal[strings.ToUpper(currency)] {
		return amount * 100
	}
	return amount
}

type stripeChannel struct{}

func (stripeChannel) Key() string { return chStripe }

func (stripeChannel) Available(cfg config, _ string) bool {
	return cfg.StripeEnabled && cfg.StripeSecretKey != "" && cfg.StripeWebhookSecret != ""
}

type stripeRef struct {
	ID  string `json:"id"`
	URL string `json:"url"`
}

type stripeSession struct {
	ID                string            `json:"id"`
	URL               string            `json:"url"`
	PaymentStatus     string            `json:"payment_status"`
	AmountTotal       int64             `json:"amount_total"`
	Currency          string            `json:"currency"`
	ClientReferenceID string            `json:"client_reference_id"`
	PaymentIntent     any               `json:"payment_intent"`
	Metadata          map[string]string `json:"metadata"`
}

func (s stripeSession) result() *paidResult {
	if s.PaymentStatus != "paid" {
		return nil
	}
	orderNo := s.ClientReferenceID
	if orderNo == "" {
		orderNo = s.Metadata["order_no"]
	}
	trade := s.ID
	if pi, ok := s.PaymentIntent.(string); ok && pi != "" {
		trade = pi
	}
	cur := strings.ToUpper(s.Currency)
	return &paidResult{OrderNo: orderNo, TradeNo: trade, AmountCents: fromStripeAmount(s.AmountTotal, cur), Currency: cur}
}

func stripeDo(ctx context.Context, cfg config, method, path string, form url.Values) (*stripeSession, error) {
	var body io.Reader
	if form != nil {
		body = strings.NewReader(form.Encode())
	}
	req, _ := http.NewRequestWithContext(ctx, method, stripeAPIBase+path, body)
	req.Header.Set("Authorization", "Bearer "+cfg.StripeSecretKey)
	if form != nil {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		var e struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = json.Unmarshal(data, &e)
		return nil, fmt.Errorf("Stripe 请求失败（%d）：%s", resp.StatusCode, e.Error.Message)
	}
	var s stripeSession
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, errors.New("Stripe 响应格式无效")
	}
	return &s, nil
}

func (stripeChannel) Create(ctx context.Context, in createInput) (string, action, error) {
	o := in.Order
	back := in.BaseURL + "/pay/orders/" + o.OrderNo
	form := url.Values{}
	form.Set("mode", "payment")
	form.Set("success_url", back)
	form.Set("cancel_url", back)
	form.Set("client_reference_id", o.OrderNo)
	form.Set("metadata[order_no]", o.OrderNo)
	form.Set("payment_intent_data[metadata][order_no]", o.OrderNo)
	form.Set("expires_at", strconv.FormatInt(o.ExpiresAt.Unix(), 10))
	form.Set("line_items[0][quantity]", "1")
	form.Set("line_items[0][price_data][currency]", strings.ToLower(o.Currency))
	form.Set("line_items[0][price_data][unit_amount]", strconv.FormatInt(stripeAmount(o.AmountCents, o.Currency), 10))
	form.Set("line_items[0][price_data][product_data][name]", truncateRunes(o.Title, 200))
	s, err := stripeDo(ctx, in.Cfg, http.MethodPost, "/v1/checkout/sessions", form)
	if err != nil {
		return "", action{}, err
	}
	if s.URL == "" {
		return "", action{}, errors.New("Stripe 未返回收银台地址")
	}
	ref, _ := json.Marshal(stripeRef{ID: s.ID, URL: s.URL})
	return string(ref), action{Type: "redirect", URL: s.URL}, nil
}

func (stripeChannel) Resume(in createInput) (action, error) {
	var ref stripeRef
	if json.Unmarshal([]byte(in.Order.ChannelRef), &ref) != nil || ref.URL == "" {
		return action{}, errors.New("支付链接已失效，请重新下单")
	}
	return action{Type: "redirect", URL: ref.URL}, nil
}

func (stripeChannel) Query(ctx context.Context, cfg config, o *Order) (*paidResult, error) {
	var ref stripeRef
	if json.Unmarshal([]byte(o.ChannelRef), &ref) != nil || ref.ID == "" {
		return nil, nil
	}
	s, err := stripeDo(ctx, cfg, http.MethodGet, "/v1/checkout/sessions/"+url.PathEscape(ref.ID), nil)
	if err != nil {
		return nil, err
	}
	return s.result(), nil
}

// stripeVerifySignature 校验 Stripe-Signature（t=…,v1=…）：HMAC-SHA256(secret, "t.payload")，并限制时间偏差。
func stripeVerifySignature(secret, header string, body []byte, now time.Time) error {
	var ts string
	var sigs []string
	for _, part := range strings.Split(header, ",") {
		k, v, _ := strings.Cut(strings.TrimSpace(part), "=")
		switch k {
		case "t":
			ts = v
		case "v1":
			sigs = append(sigs, v)
		}
	}
	t, err := strconv.ParseInt(ts, 10, 64)
	if err != nil || len(sigs) == 0 {
		return errors.New("Stripe 签名头无效")
	}
	if d := now.Sub(time.Unix(t, 0)); d > stripeTolerance || d < -stripeTolerance {
		return errors.New("Stripe 签名已过期")
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(ts + "." + string(body)))
	expected := mac.Sum(nil)
	for _, s := range sigs {
		if got, err := hex.DecodeString(s); err == nil && hmac.Equal(got, expected) {
			return nil
		}
	}
	return errors.New("Stripe 验签失败")
}

func (stripeChannel) Notify(cfg config, r *http.Request, body []byte) (*paidResult, notifyReply, error) {
	fail := notifyReply{Status: http.StatusBadRequest, ContentType: "application/json", Body: `{"received":false}`}
	if err := stripeVerifySignature(cfg.StripeWebhookSecret, r.Header.Get("Stripe-Signature"), body, time.Now()); err != nil {
		return nil, fail, err
	}
	var ev struct {
		Type string `json:"type"`
		Data struct {
			Object stripeSession `json:"object"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &ev); err != nil {
		return nil, fail, errors.New("Stripe 事件格式无效")
	}
	ok := notifyReply{Status: http.StatusOK, ContentType: "application/json", Body: `{"received":true}`}
	if ev.Type != "checkout.session.completed" && ev.Type != "checkout.session.async_payment_succeeded" {
		return nil, ok, nil
	}
	return ev.Data.Object.result(), ok, nil
}
