package payment

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

// 支付宝开放平台（RSA2）：电脑网站支付 alipay.trade.page.pay / 手机网站支付 alipay.trade.wap.pay（跳转收银台），
// 异步通知验签后履约；轮询时以 alipay.trade.query 主动查询（响应同样验签）。仅支持人民币。

const (
	alipayGateway        = "https://openapi.alipay.com/gateway.do"
	alipaySandboxGateway = "https://openapi-sandbox.dl.alipaydev.com/gateway.do"
)

var chinaTime = time.FixedZone("CST", 8*3600)

type alipayChannel struct{}

func (alipayChannel) Key() string { return chAlipay }

func (alipayChannel) Available(cfg config, currency string) bool {
	return cfg.AlipayEnabled && cfg.AlipayAppID != "" && cfg.AlipayPrivate != "" && cfg.AlipayPublicKey != "" && (currency == "" || currency == "CNY")
}

func alipayGatewayURL(cfg config) string {
	if cfg.AlipaySandbox {
		return alipaySandboxGateway
	}
	return alipayGateway
}

// alipaySignContent 待签名串：参数按键排序、剔除 sign 与空值，「k=v」以 & 连接（值不做 URL 编码）。
// 请求签名保留 sign_type；验证异步通知时同时剔除 sign_type。
func alipaySignContent(p url.Values, dropSignType bool) string {
	keys := make([]string, 0, len(p))
	for k := range p {
		if k == "sign" || (dropSignType && k == "sign_type") || p.Get(k) == "" {
			continue
		}
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, k+"="+p.Get(k))
	}
	return strings.Join(parts, "&")
}

// alipaySignedParams 组装并签名公共参数 + biz_content。
func alipaySignedParams(cfg config, method string, biz map[string]any, extra map[string]string) (url.Values, error) {
	key, err := parsePrivateKey(cfg.AlipayPrivate)
	if err != nil {
		return nil, fmt.Errorf("支付宝应用私钥无效: %w", err)
	}
	bizJSON, err := json.Marshal(biz)
	if err != nil {
		return nil, err
	}
	p := url.Values{}
	p.Set("app_id", cfg.AlipayAppID)
	p.Set("method", method)
	p.Set("format", "JSON")
	p.Set("charset", "utf-8")
	p.Set("sign_type", "RSA2")
	p.Set("timestamp", time.Now().In(chinaTime).Format("2006-01-02 15:04:05"))
	p.Set("version", "1.0")
	p.Set("biz_content", string(bizJSON))
	for k, v := range extra {
		p.Set(k, v)
	}
	sign, err := signSHA256(key, alipaySignContent(p, false))
	if err != nil {
		return nil, err
	}
	p.Set("sign", sign)
	return p, nil
}

func truncateRunes(s string, n int) string {
	if r := []rune(s); len(r) > n {
		return string(r[:n])
	}
	return s
}

func (c alipayChannel) Create(_ context.Context, in createInput) (string, action, error) {
	act, err := c.Resume(in)
	return "", act, err
}

// Resume 生成收银台跳转地址（每次重新签名；订单超时时间随订单）。
func (alipayChannel) Resume(in createInput) (action, error) {
	o := in.Order
	method, product := "alipay.trade.page.pay", "FAST_INSTANT_TRADE_PAY"
	biz := map[string]any{
		"out_trade_no": o.OrderNo, "total_amount": formatYuan(o.AmountCents), "subject": truncateRunes(o.Title, 128),
		"time_expire": o.ExpiresAt.In(chinaTime).Format("2006-01-02 15:04:05"),
	}
	returnURL := in.BaseURL + "/pay/orders/" + o.OrderNo
	if in.Mobile {
		method, product = "alipay.trade.wap.pay", "QUICK_WAP_WAY"
		biz["quit_url"] = returnURL
	}
	biz["product_code"] = product
	p, err := alipaySignedParams(in.Cfg, method, biz, map[string]string{
		"notify_url": in.BaseURL + "/api/v1/payment/notify/alipay", "return_url": returnURL,
	})
	if err != nil {
		return action{}, err
	}
	return action{Type: "redirect", URL: alipayGatewayURL(in.Cfg) + "?" + p.Encode()}, nil
}

type alipayTrade struct {
	Code        string `json:"code"`
	Msg         string `json:"msg"`
	SubCode     string `json:"sub_code"`
	SubMsg      string `json:"sub_msg"`
	TradeNo     string `json:"trade_no"`
	OutTradeNo  string `json:"out_trade_no"`
	TradeStatus string `json:"trade_status"`
	TotalAmount string `json:"total_amount"`
}

func alipayPaid(status string) bool { return status == "TRADE_SUCCESS" || status == "TRADE_FINISHED" }

// Query alipay.trade.query；交易不存在（用户尚未扫码/登录）视为未支付。
func (alipayChannel) Query(ctx context.Context, cfg config, o *Order) (*paidResult, error) {
	p, err := alipaySignedParams(cfg, "alipay.trade.query", map[string]any{"out_trade_no": o.OrderNo}, nil)
	if err != nil {
		return nil, err
	}
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, alipayGatewayURL(cfg), strings.NewReader(p.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded;charset=utf-8")
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	trade, err := alipayVerifyResponse(cfg, body, "alipay_trade_query_response")
	if err != nil {
		return nil, err
	}
	if trade.Code != "10000" {
		if trade.SubCode == "ACQ.TRADE_NOT_EXIST" {
			return nil, nil
		}
		return nil, fmt.Errorf("支付宝查询失败：%s %s", trade.SubCode, trade.SubMsg)
	}
	if !alipayPaid(trade.TradeStatus) || trade.OutTradeNo != o.OrderNo {
		return nil, nil
	}
	return &paidResult{OrderNo: trade.OutTradeNo, TradeNo: trade.TradeNo, AmountCents: parseYuan(trade.TotalAmount), Currency: "CNY"}, nil
}

// alipayVerifyResponse 校验同步响应：签名覆盖响应节点的原始 JSON 文本。
func alipayVerifyResponse(cfg config, body []byte, node string) (*alipayTrade, error) {
	var envelope map[string]json.RawMessage
	if err := json.Unmarshal(body, &envelope); err != nil {
		return nil, errors.New("支付宝响应格式无效")
	}
	raw, ok := envelope[node]
	if !ok {
		return nil, errors.New("支付宝响应缺少结果节点")
	}
	var trade alipayTrade
	if err := json.Unmarshal(raw, &trade); err != nil {
		return nil, errors.New("支付宝响应格式无效")
	}
	var sign string
	_ = json.Unmarshal(envelope["sign"], &sign)
	if sign == "" {
		// 网关级错误（如签名错误、参数缺失）不带签名，只作为错误返回，不据此判定支付成功
		return nil, fmt.Errorf("支付宝返回错误：%s %s", trade.Code, trade.Msg)
	}
	pub, err := parsePublicKey(cfg.AlipayPublicKey)
	if err != nil {
		return nil, fmt.Errorf("支付宝公钥无效: %w", err)
	}
	if !verifySHA256(pub, string(raw), sign) {
		return nil, errors.New("支付宝响应验签失败")
	}
	return &trade, nil
}

// Notify 异步通知：验签（剔除 sign/sign_type）、校验 app_id，交易成功时返回结果；应答 success 后支付宝停止重发。
func (alipayChannel) Notify(cfg config, _ *http.Request, body []byte) (*paidResult, notifyReply, error) {
	fail := notifyReply{Status: http.StatusOK, ContentType: "text/plain", Body: "fail"}
	values, err := url.ParseQuery(string(body))
	if err != nil {
		return nil, fail, errors.New("通知格式无效")
	}
	pub, err := parsePublicKey(cfg.AlipayPublicKey)
	if err != nil {
		return nil, fail, err
	}
	if !verifySHA256(pub, alipaySignContent(values, true), values.Get("sign")) {
		return nil, fail, errors.New("支付宝通知验签失败")
	}
	if values.Get("app_id") != cfg.AlipayAppID {
		return nil, fail, errors.New("支付宝通知 app_id 不匹配")
	}
	ok := notifyReply{Status: http.StatusOK, ContentType: "text/plain", Body: "success"}
	if !alipayPaid(values.Get("trade_status")) {
		return nil, ok, nil
	}
	return &paidResult{OrderNo: values.Get("out_trade_no"), TradeNo: values.Get("trade_no"), AmountCents: parseYuan(values.Get("total_amount")), Currency: "CNY"}, ok, nil
}
