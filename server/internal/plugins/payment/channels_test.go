package payment

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"
)

// 渠道签名/验签的单元测试：本地生成密钥对，模拟网关的请求与回调。

func testKeys(t *testing.T) (*rsa.PrivateKey, string, string) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	priv := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})
	pubDER, _ := x509.MarshalPKIXPublicKey(&key.PublicKey)
	// 公钥用支付宝后台导出的「纯 Base64」形式，覆盖无 PEM 头的解析
	return key, string(priv), base64.StdEncoding.EncodeToString(pubDER)
}

func testOrder() *Order {
	return &Order{OrderNo: "2026092412000012345678", Title: "专业版", AmountCents: 1900, Currency: "CNY", ExpiresAt: time.Now().Add(time.Hour)}
}

func TestKeyParsing(t *testing.T) {
	key, priv, pub := testKeys(t)
	pk8, _ := x509.MarshalPKCS8PrivateKey(key)
	for _, raw := range []string{priv, base64.StdEncoding.EncodeToString(pk8), string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: pk8}))} {
		if _, err := parsePrivateKey(raw); err != nil {
			t.Fatalf("应能解析私钥: %v", err)
		}
	}
	if _, err := parsePublicKey(pub); err != nil {
		t.Fatalf("应能解析纯 Base64 公钥: %v", err)
	}
	if _, err := parsePrivateKey("not a key"); err == nil {
		t.Fatal("非法私钥应报错")
	}
}

func TestYuanConversion(t *testing.T) {
	if formatYuan(1900) != "19.00" || formatYuan(5) != "0.05" || formatYuan(123456) != "1234.56" {
		t.Fatal("formatYuan 错误")
	}
	for in, want := range map[string]int64{"19.00": 1900, "19": 1900, "0.5": 50, "0.05": 5, "1.234": -1, "abc": -1, "": -1} {
		if got := parseYuan(in); got != want {
			t.Fatalf("parseYuan(%q) = %d，应为 %d", in, got, want)
		}
	}
}

func TestAlipaySignAndNotify(t *testing.T) {
	key, priv, pub := testKeys(t)
	cfg := config{AlipayEnabled: true, AlipayAppID: "2021000000000001", AlipayPrivate: priv, AlipayPublicKey: pub}
	if !(alipayChannel{}).Available(cfg, "CNY") || (alipayChannel{}).Available(cfg, "USD") {
		t.Fatal("支付宝仅在配置完整且货币为 CNY 时可用")
	}
	act, err := alipayChannel{}.Resume(createInput{Order: testOrder(), Cfg: cfg, BaseURL: "https://kf.example.com"})
	if err != nil || act.Type != "redirect" || !strings.HasPrefix(act.URL, alipayGateway+"?") {
		t.Fatalf("应生成收银台跳转地址: %v %+v", err, act)
	}
	u, _ := url.Parse(act.URL)
	q := u.Query()
	if !verifySHA256(&key.PublicKey, alipaySignContent(q, false), q.Get("sign")) {
		t.Fatal("请求签名应可用应用公钥验证")
	}
	if q.Get("method") != "alipay.trade.page.pay" || q.Get("notify_url") != "https://kf.example.com/api/v1/payment/notify/alipay" || !strings.Contains(q.Get("biz_content"), `"total_amount":"19.00"`) {
		t.Fatalf("请求参数错误: %v", q)
	}
	mobile, _ := alipayChannel{}.Resume(createInput{Order: testOrder(), Cfg: cfg, BaseURL: "https://kf.example.com", Mobile: true})
	if !strings.Contains(mobile.URL, "alipay.trade.wap.pay") {
		t.Fatal("移动端应走手机网站支付")
	}

	// 异步通知：以「支付宝私钥」（测试中同一密钥对）签名
	notify := url.Values{}
	notify.Set("app_id", cfg.AlipayAppID)
	notify.Set("out_trade_no", "2026092412000012345678")
	notify.Set("trade_no", "2026092422001")
	notify.Set("trade_status", "TRADE_SUCCESS")
	notify.Set("total_amount", "19.00")
	notify.Set("sign_type", "RSA2")
	sign, _ := signSHA256(key, alipaySignContent(notify, true))
	notify.Set("sign", sign)
	res, reply, err := alipayChannel{}.Notify(cfg, nil, []byte(notify.Encode()))
	if err != nil || res == nil || res.AmountCents != 1900 || res.TradeNo != "2026092422001" || reply.Body != "success" {
		t.Fatalf("合法通知应解析成功: %v %+v %+v", err, res, reply)
	}
	notify.Set("total_amount", "0.01") // 篡改金额
	if _, reply, err := (alipayChannel{}).Notify(cfg, nil, []byte(notify.Encode())); err == nil || reply.Body != "fail" {
		t.Fatal("篡改后的通知应验签失败")
	}
}

func TestAlipayQueryVerifiesResponse(t *testing.T) {
	key, priv, pub := testKeys(t)
	cfg := config{AlipayEnabled: true, AlipayAppID: "app", AlipayPrivate: priv, AlipayPublicKey: pub}
	raw := `{"code":"10000","msg":"Success","trade_no":"T1","out_trade_no":"2026092412000012345678","trade_status":"TRADE_SUCCESS","total_amount":"19.00"}`
	sign, _ := signSHA256(key, raw)
	body := []byte(`{"alipay_trade_query_response":` + raw + `,"sign":"` + sign + `"}`)
	trade, err := alipayVerifyResponse(cfg, body, "alipay_trade_query_response")
	if err != nil || trade.TradeStatus != "TRADE_SUCCESS" {
		t.Fatalf("合法响应应验签通过: %v", err)
	}
	tampered := []byte(strings.Replace(string(body), `"19.00"`, `"0.01"`, 1))
	if _, err := alipayVerifyResponse(cfg, tampered, "alipay_trade_query_response"); err == nil {
		t.Fatal("篡改的响应应验签失败")
	}
}

// wechatSign 模拟微信支付对应答/回调签名。
func wechatSign(t *testing.T, key *rsa.PrivateKey, h http.Header, body string, ts time.Time) {
	t.Helper()
	nonce := randomNonce()
	sig, _ := signSHA256(key, strconv.FormatInt(ts.Unix(), 10)+"\n"+nonce+"\n"+body+"\n")
	h.Set("Wechatpay-Timestamp", strconv.FormatInt(ts.Unix(), 10))
	h.Set("Wechatpay-Nonce", nonce)
	h.Set("Wechatpay-Signature", sig)
	h.Set("Wechatpay-Serial", "PUB_KEY_ID_TEST")
}

func wechatConfig(t *testing.T) (config, *rsa.PrivateKey) {
	t.Helper()
	key, priv, pub := testKeys(t)
	return config{
		WechatEnabled: true, WechatMchID: "1900000001", WechatAppID: "wx0000000000000001", WechatSerialNo: "SERIAL",
		WechatPrivate: priv, WechatAPIv3Key: "0123456789abcdef0123456789abcdef", WechatPublicKey: pub, WechatPublicKeyID: "PUB_KEY_ID_TEST",
	}, key
}

func TestWechatNativeOrderAndQuery(t *testing.T) {
	cfg, key := wechatConfig(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		// 校验请求签名头
		auth := r.Header.Get("Authorization")
		fields := map[string]string{}
		for _, kv := range strings.Split(strings.TrimPrefix(auth, "WECHATPAY2-SHA256-RSA2048 "), ",") {
			k, v, _ := strings.Cut(kv, "=")
			fields[k] = strings.Trim(v, `"`)
		}
		msg := r.Method + "\n" + r.URL.RequestURI() + "\n" + fields["timestamp"] + "\n" + fields["nonce_str"] + "\n" + string(body) + "\n"
		if fields["mchid"] != cfg.WechatMchID || fields["serial_no"] != "SERIAL" || !verifySHA256(&key.PublicKey, msg, fields["signature"]) {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		resp := `{"code_url":"weixin://wxpay/bizpayurl?pr=abc"}`
		if r.Method == http.MethodGet {
			resp = `{"appid":"wx0000000000000001","mchid":"1900000001","out_trade_no":"2026092412000012345678","transaction_id":"4200","trade_state":"SUCCESS","amount":{"total":1900,"currency":"CNY"}}`
		}
		wechatSign(t, key, w.Header(), resp, time.Now())
		_, _ = w.Write([]byte(resp))
	}))
	defer srv.Close()
	old := wechatAPIBase
	wechatAPIBase = srv.URL
	defer func() { wechatAPIBase = old }()

	ref, act, err := wechatChannel{}.Create(context.Background(), createInput{Order: testOrder(), Cfg: cfg, BaseURL: "https://kf.example.com"})
	if err != nil || ref != "weixin://wxpay/bizpayurl?pr=abc" || act.Type != "qrcode" || !strings.HasPrefix(act.QR, "data:image/png;base64,") {
		t.Fatalf("Native 下单应返回二维码: %v %q %+v", err, ref, act.Type)
	}
	res, err := wechatChannel{}.Query(context.Background(), cfg, testOrder())
	if err != nil || res == nil || res.AmountCents != 1900 || res.TradeNo != "4200" {
		t.Fatalf("查询应返回已支付: %v %+v", err, res)
	}
}

func TestWechatNotify(t *testing.T) {
	cfg, key := wechatConfig(t)
	plain := `{"appid":"wx0000000000000001","mchid":"1900000001","out_trade_no":"2026092412000012345678","transaction_id":"4200","trade_state":"SUCCESS","amount":{"total":1900,"currency":"CNY"}}`
	block, _ := aes.NewCipher([]byte(cfg.WechatAPIv3Key))
	gcm, _ := cipher.NewGCM(block)
	nonce, aad := "abcdefghijkl", "transaction"
	cipherText := base64.StdEncoding.EncodeToString(gcm.Seal(nil, []byte(nonce), []byte(plain), []byte(aad)))
	body, _ := json.Marshal(map[string]any{"event_type": "TRANSACTION.SUCCESS", "resource": map[string]string{
		"algorithm": "AEAD_AES_256_GCM", "ciphertext": cipherText, "associated_data": aad, "nonce": nonce,
	}})
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	wechatSign(t, key, req.Header, string(body), time.Now())
	res, reply, err := wechatChannel{}.Notify(cfg, req, body)
	if err != nil || res == nil || res.OrderNo != "2026092412000012345678" || res.AmountCents != 1900 || reply.Status != http.StatusNoContent {
		t.Fatalf("合法回调应解析成功: %v %+v %+v", err, res, reply)
	}
	stale := httptest.NewRequest(http.MethodPost, "/", nil)
	wechatSign(t, key, stale.Header, string(body), time.Now().Add(-10*time.Minute))
	if _, reply, err := (wechatChannel{}).Notify(cfg, stale, body); err == nil || reply.Status != http.StatusBadRequest {
		t.Fatal("过期签名应被拒绝")
	}
	wrongSerial := httptest.NewRequest(http.MethodPost, "/", nil)
	wechatSign(t, key, wrongSerial.Header, string(body), time.Now())
	wrongSerial.Header.Set("Wechatpay-Serial", "OTHER")
	if _, _, err := (wechatChannel{}).Notify(cfg, wrongSerial, body); err == nil {
		t.Fatal("公钥 ID 不匹配应被拒绝")
	}
}

func stripeSignature(secret string, body []byte, ts time.Time) string {
	mac := hmac.New(sha256.New, []byte(secret))
	t := strconv.FormatInt(ts.Unix(), 10)
	mac.Write([]byte(t + "." + string(body)))
	return "t=" + t + ",v1=" + hex.EncodeToString(mac.Sum(nil))
}

func TestStripeCheckoutAndWebhook(t *testing.T) {
	cfg := config{StripeEnabled: true, StripeSecretKey: "sk_test_x", StripeWebhookSecret: "whsec_test"}
	var form url.Values
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer sk_test_x" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		body, _ := io.ReadAll(r.Body)
		form, _ = url.ParseQuery(string(body))
		_, _ = w.Write([]byte(`{"id":"cs_test_1","url":"https://checkout.stripe.com/c/pay/cs_test_1","payment_status":"unpaid"}`))
	}))
	defer srv.Close()
	old := stripeAPIBase
	stripeAPIBase = srv.URL
	defer func() { stripeAPIBase = old }()

	o := testOrder()
	o.Currency, o.AmountCents = "JPY", 150000 // 零小数位货币：1500 日元
	ref, act, err := stripeChannel{}.Create(context.Background(), createInput{Order: o, Cfg: cfg, BaseURL: "https://kf.example.com"})
	if err != nil || act.URL != "https://checkout.stripe.com/c/pay/cs_test_1" || !strings.Contains(ref, "cs_test_1") {
		t.Fatalf("应创建 Checkout Session: %v %+v", err, act)
	}
	if form.Get("line_items[0][price_data][unit_amount]") != "1500" || form.Get("line_items[0][price_data][currency]") != "jpy" || form.Get("client_reference_id") != o.OrderNo {
		t.Fatalf("Checkout 参数错误: %v", form)
	}

	event := []byte(`{"type":"checkout.session.completed","data":{"object":{"id":"cs_test_1","payment_status":"paid","amount_total":1500,"currency":"jpy","client_reference_id":"2026092412000012345678","payment_intent":"pi_1"}}}`)
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	req.Header.Set("Stripe-Signature", stripeSignature("whsec_test", event, time.Now()))
	res, reply, err := stripeChannel{}.Notify(cfg, req, event)
	if err != nil || res == nil || res.AmountCents != 150000 || res.Currency != "JPY" || res.TradeNo != "pi_1" || reply.Status != http.StatusOK {
		t.Fatalf("合法 Webhook 应解析成功: %v %+v", err, res)
	}
	bad := httptest.NewRequest(http.MethodPost, "/", nil)
	bad.Header.Set("Stripe-Signature", stripeSignature("whsec_other", event, time.Now()))
	if _, _, err := (stripeChannel{}).Notify(cfg, bad, event); err == nil {
		t.Fatal("错误密钥签名应被拒绝")
	}
	old2 := httptest.NewRequest(http.MethodPost, "/", nil)
	old2.Header.Set("Stripe-Signature", stripeSignature("whsec_test", event, time.Now().Add(-10*time.Minute)))
	if _, _, err := (stripeChannel{}).Notify(cfg, old2, event); err == nil {
		t.Fatal("过期签名应被拒绝")
	}
}
