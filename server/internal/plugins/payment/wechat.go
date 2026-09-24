package payment

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image/png"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/boombuler/barcode"
	"github.com/boombuler/barcode/qr"
)

// 微信支付 APIv3：Native 下单得到 code_url，前端展示二维码扫码支付；请求以商户私钥签名，
// 响应与回调以「微信支付公钥」验签（公钥模式，需配置公钥 ID），回调资源以 APIv3 密钥 AES-256-GCM 解密。仅支持人民币。

var wechatAPIBase = "https://api.mch.weixin.qq.com" // 测试可替换

const wechatMaxSkew = 5 * time.Minute

type wechatChannel struct{}

func (wechatChannel) Key() string { return chWechat }

func (wechatChannel) Available(cfg config, currency string) bool {
	return cfg.WechatEnabled && cfg.WechatMchID != "" && cfg.WechatAppID != "" && cfg.WechatSerialNo != "" && cfg.WechatPrivate != "" &&
		len(cfg.WechatAPIv3Key) == 32 && cfg.WechatPublicKey != "" && cfg.WechatPublicKeyID != "" && (currency == "" || currency == "CNY")
}

func randomNonce() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// wechatAuthorization 请求签名头：签名串为「方法\n路径(含查询)\n时间戳\n随机串\n请求体\n」。
func wechatAuthorization(cfg config, method, pathWithQuery, body string, now time.Time) (string, error) {
	key, err := parsePrivateKey(cfg.WechatPrivate)
	if err != nil {
		return "", fmt.Errorf("微信支付商户私钥无效: %w", err)
	}
	ts, nonce := strconv.FormatInt(now.Unix(), 10), randomNonce()
	sig, err := signSHA256(key, method+"\n"+pathWithQuery+"\n"+ts+"\n"+nonce+"\n"+body+"\n")
	if err != nil {
		return "", err
	}
	return fmt.Sprintf(`WECHATPAY2-SHA256-RSA2048 mchid="%s",nonce_str="%s",signature="%s",timestamp="%s",serial_no="%s"`,
		cfg.WechatMchID, nonce, sig, ts, cfg.WechatSerialNo), nil
}

// wechatVerify 校验微信支付的应答/回调签名（「时间戳\n随机串\n报文主体\n」）与时间戳新鲜度。
func wechatVerify(cfg config, h http.Header, body []byte, now time.Time) error {
	if serial := h.Get("Wechatpay-Serial"); serial != cfg.WechatPublicKeyID {
		return fmt.Errorf("微信支付签名公钥 ID 不匹配（%s）", serial)
	}
	ts, err := strconv.ParseInt(h.Get("Wechatpay-Timestamp"), 10, 64)
	if err != nil {
		return errors.New("微信支付签名时间戳无效")
	}
	if d := now.Sub(time.Unix(ts, 0)); d > wechatMaxSkew || d < -wechatMaxSkew {
		return errors.New("微信支付签名已过期")
	}
	pub, err := parsePublicKey(cfg.WechatPublicKey)
	if err != nil {
		return fmt.Errorf("微信支付公钥无效: %w", err)
	}
	if !verifySHA256(pub, h.Get("Wechatpay-Timestamp")+"\n"+h.Get("Wechatpay-Nonce")+"\n"+string(body)+"\n", h.Get("Wechatpay-Signature")) {
		return errors.New("微信支付验签失败")
	}
	return nil
}

// wechatDo 调用 APIv3（成功响应必须验签）。
func wechatDo(ctx context.Context, cfg config, method, pathWithQuery string, payload any) (int, []byte, error) {
	body := ""
	if payload != nil {
		raw, err := json.Marshal(payload)
		if err != nil {
			return 0, nil, err
		}
		body = string(raw)
	}
	auth, err := wechatAuthorization(cfg, method, pathWithQuery, body, time.Now())
	if err != nil {
		return 0, nil, err
	}
	req, _ := http.NewRequestWithContext(ctx, method, wechatAPIBase+pathWithQuery, bytes.NewReader([]byte(body)))
	req.Header.Set("Authorization", auth)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "KnowForge-Payment")
	resp, err := httpClient.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return 0, nil, err
	}
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		if err := wechatVerify(cfg, resp.Header, data, time.Now()); err != nil {
			return resp.StatusCode, nil, err
		}
	}
	return resp.StatusCode, data, nil
}

func wechatError(status int, data []byte) error {
	var e struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	}
	_ = json.Unmarshal(data, &e)
	return fmt.Errorf("微信支付请求失败（%d）：%s %s", status, e.Code, e.Message)
}

// truncateBytes 按 UTF-8 字节截断（不截断半个字符）。
func truncateBytes(s string, n int) string {
	if len(s) <= n {
		return s
	}
	out := ""
	for _, r := range s {
		if len(out)+len(string(r)) > n {
			break
		}
		out += string(r)
	}
	return out
}

func (wechatChannel) Create(ctx context.Context, in createInput) (string, action, error) {
	o := in.Order
	status, data, err := wechatDo(ctx, in.Cfg, http.MethodPost, "/v3/pay/transactions/native", map[string]any{
		"appid": in.Cfg.WechatAppID, "mchid": in.Cfg.WechatMchID, "description": truncateBytes(o.Title, 127), "out_trade_no": o.OrderNo,
		"time_expire": o.ExpiresAt.In(chinaTime).Format(time.RFC3339), "notify_url": in.BaseURL + "/api/v1/payment/notify/wechat",
		"amount": map[string]any{"total": o.AmountCents, "currency": "CNY"},
	})
	if err != nil {
		return "", action{}, err
	}
	if status != http.StatusOK {
		return "", action{}, wechatError(status, data)
	}
	var r struct {
		CodeURL string `json:"code_url"`
	}
	if json.Unmarshal(data, &r) != nil || r.CodeURL == "" {
		return "", action{}, errors.New("微信支付未返回二维码链接")
	}
	img, err := qrDataURI(r.CodeURL)
	if err != nil {
		return "", action{}, err
	}
	return r.CodeURL, action{Type: "qrcode", QR: img}, nil
}

func (wechatChannel) Resume(in createInput) (action, error) {
	if in.Order.ChannelRef == "" {
		return action{}, errors.New("二维码已失效，请重新下单")
	}
	img, err := qrDataURI(in.Order.ChannelRef)
	if err != nil {
		return action{}, err
	}
	return action{Type: "qrcode", QR: img}, nil
}

type wechatTransaction struct {
	AppID         string `json:"appid"`
	MchID         string `json:"mchid"`
	OutTradeNo    string `json:"out_trade_no"`
	TransactionID string `json:"transaction_id"`
	TradeState    string `json:"trade_state"`
	Amount        struct {
		Total    int64  `json:"total"`
		Currency string `json:"currency"`
	} `json:"amount"`
}

func (t wechatTransaction) result(cfg config) (*paidResult, error) {
	if t.MchID != cfg.WechatMchID || t.AppID != cfg.WechatAppID {
		return nil, errors.New("微信支付交易的商户号/AppID 不匹配")
	}
	if t.TradeState != "SUCCESS" {
		return nil, nil
	}
	cur := t.Amount.Currency
	if cur == "" {
		cur = "CNY"
	}
	return &paidResult{OrderNo: t.OutTradeNo, TradeNo: t.TransactionID, AmountCents: t.Amount.Total, Currency: cur}, nil
}

// Query 按商户订单号查询；订单不存在视为未支付。
func (wechatChannel) Query(ctx context.Context, cfg config, o *Order) (*paidResult, error) {
	status, data, err := wechatDo(ctx, cfg, http.MethodGet, "/v3/pay/transactions/out-trade-no/"+url.PathEscape(o.OrderNo)+"?mchid="+url.QueryEscape(cfg.WechatMchID), nil)
	if err != nil {
		return nil, err
	}
	if status == http.StatusNotFound {
		return nil, nil
	}
	if status != http.StatusOK {
		return nil, wechatError(status, data)
	}
	var t wechatTransaction
	if err := json.Unmarshal(data, &t); err != nil {
		return nil, errors.New("微信支付查询响应格式无效")
	}
	return t.result(cfg)
}

// wechatDecrypt 以 APIv3 密钥解密回调资源（AEAD_AES_256_GCM）。
func wechatDecrypt(apiV3Key, nonce, associatedData, ciphertext string) ([]byte, error) {
	raw, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher([]byte(apiV3Key))
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return gcm.Open(nil, []byte(nonce), raw, []byte(associatedData))
}

// Notify 支付结果通知：验签 → 解密 resource → 校验商户号/AppID；成功应答 204，失败应答 4xx 让微信重发。
func (wechatChannel) Notify(cfg config, r *http.Request, body []byte) (*paidResult, notifyReply, error) {
	fail := func(msg string) notifyReply {
		raw, _ := json.Marshal(map[string]string{"code": "FAIL", "message": msg})
		return notifyReply{Status: http.StatusBadRequest, ContentType: "application/json", Body: string(raw)}
	}
	if err := wechatVerify(cfg, r.Header, body, time.Now()); err != nil {
		return nil, fail("签名错误"), err
	}
	var n struct {
		EventType string `json:"event_type"`
		Resource  struct {
			Algorithm      string `json:"algorithm"`
			Ciphertext     string `json:"ciphertext"`
			AssociatedData string `json:"associated_data"`
			Nonce          string `json:"nonce"`
		} `json:"resource"`
	}
	if err := json.Unmarshal(body, &n); err != nil || n.Resource.Algorithm != "AEAD_AES_256_GCM" {
		return nil, fail("报文格式错误"), errors.New("微信支付通知格式无效")
	}
	ok := notifyReply{Status: http.StatusNoContent}
	if n.EventType != "TRANSACTION.SUCCESS" {
		return nil, ok, nil
	}
	plain, err := wechatDecrypt(cfg.WechatAPIv3Key, n.Resource.Nonce, n.Resource.AssociatedData, n.Resource.Ciphertext)
	if err != nil {
		return nil, fail("解密失败"), fmt.Errorf("微信支付通知解密失败: %w", err)
	}
	var t wechatTransaction
	if err := json.Unmarshal(plain, &t); err != nil {
		return nil, fail("报文格式错误"), errors.New("微信支付交易格式无效")
	}
	res, err := t.result(cfg)
	if err != nil {
		return nil, fail("商户不匹配"), err
	}
	return res, ok, nil
}

// qrDataURI 把内容编码为二维码 PNG（data URI）。
func qrDataURI(content string) (string, error) {
	code, err := qr.Encode(content, qr.M, qr.Auto)
	if err != nil {
		return "", err
	}
	scaled, err := barcode.Scale(code, 240, 240)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, scaled); err != nil {
		return "", err
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes()), nil
}
