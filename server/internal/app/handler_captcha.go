package app

import (
	crand "crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"html"
	"math/big"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

// 内置验证码：图形（SVG）或算术两种，可配复杂度，可在注册/登录/评论等场景分别开启。
// 挑战答案存数据库（多实例共享），只存哈希，一次性、5 分钟有效。
const (
	cfgCaptchaType       = "captcha_type"    // image | arithmetic
	cfgCaptchaLength     = "captcha_length"  // 图形字符数 4-6
	cfgCaptchaCharset    = "captcha_charset" // digit | alnum
	cfgCaptchaNoise      = "captcha_noise"   // 干扰强度 0-3
	cfgCaptchaArithHard  = "captcha_arith_hard"
	cfgCaptchaOnRegister = "captcha_on_register"
	cfgCaptchaOnLogin    = "captcha_on_login"
	cfgCaptchaOnComment  = "captcha_on_comment"
)

const captchaTTL = 5 * time.Minute

func captchaHash(answer string) string {
	sum := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(answer))))
	return hex.EncodeToString(sum[:])
}

// storeCaptcha 存挑战答案哈希（多实例共享），顺带清理过期行。
func (a *App) storeCaptcha(id, answer string) {
	a.DB.Where("expires_at < ?", time.Now()).Delete(&models.CaptchaChallenge{})
	a.DB.Create(&models.CaptchaChallenge{ID: id, AnswerHash: captchaHash(answer), ExpiresAt: time.Now().Add(captchaTTL)})
}

// consumeCaptcha 取出并删除挑战（一次性），校验未过期且答案哈希匹配（不区分大小写）。
func (a *App) consumeCaptcha(id, answer string) bool {
	var ch models.CaptchaChallenge
	if err := a.DB.Where("id = ?", id).First(&ch).Error; err != nil {
		return false
	}
	a.DB.Delete(&models.CaptchaChallenge{}, "id = ?", id)
	if time.Now().After(ch.ExpiresAt) {
		return false
	}
	return captchaHash(answer) == ch.AnswerHash
}

// ---- 配置读取 ----

func (a *App) captchaType() string {
	if a.getSetting(cfgCaptchaType) == "arithmetic" {
		return "arithmetic"
	}
	return "image"
}

func (a *App) captchaEnabled(scene string) bool {
	switch scene {
	case "register":
		return a.getSetting(cfgCaptchaOnRegister) == "true"
	case "login":
		return a.getSetting(cfgCaptchaOnLogin) == "true"
	case "comment":
		return a.getSetting(cfgCaptchaOnComment) == "true"
	}
	return false
}

// ---- 生成 ----

func randIntn(n int) int {
	if n <= 0 {
		return 0
	}
	return rand.Intn(n)
}

func genCaptchaText(length int, charset string) string {
	chars := "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	if charset == "digit" {
		chars = "0123456789"
	}
	b := make([]byte, length)
	for i := range b {
		idx, err := crand.Int(crand.Reader, big.NewInt(int64(len(chars))))
		if err != nil {
			b[i] = chars[0]
			continue
		}
		b[i] = chars[idx.Int64()]
	}
	return string(b)
}

func genArithmetic(hard bool) (question, answer string) {
	max, ops := 10, []string{"+", "-"}
	if hard {
		max, ops = 50, []string{"+", "-", "×"}
	}
	x, y := randIntn(max)+1, randIntn(max)+1
	op := ops[randIntn(len(ops))]
	var res int
	switch op {
	case "+":
		res = x + y
	case "-":
		if y > x {
			x, y = y, x
		}
		res = x - y
	case "×":
		res = x * y
	}
	return fmt.Sprintf("%d %s %d = ?", x, op, y), strconv.Itoa(res)
}

func renderCaptchaSVG(text string, noise int) string {
	w, h := len(text)*30+20, 44
	var b strings.Builder
	fmt.Fprintf(&b, `<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">`, w, h, w, h)
	b.WriteString(`<rect width="100%" height="100%" fill="#f1f5f9"/>`)
	for i := 0; i < noise*4; i++ {
		fmt.Fprintf(&b, `<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="#cbd5e1" stroke-width="1"/>`,
			randIntn(w), randIntn(h), randIntn(w), randIntn(h))
	}
	for i, ch := range text {
		x := 15 + i*30
		y := 30 + randIntn(6) - 3
		rot := randIntn(30) - 15
		fmt.Fprintf(&b, `<text x="%d" y="%d" font-family="monospace" font-size="26" font-weight="700" fill="#334155" transform="rotate(%d %d %d)">%s</text>`,
			x, y, rot, x, y-8, html.EscapeString(string(ch)))
	}
	b.WriteString(`</svg>`)
	return b.String()
}

func newCaptchaID() string {
	raw := make([]byte, 16)
	if _, err := crand.Read(raw); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 16)
	}
	return hex.EncodeToString(raw)
}

// buildCaptcha 生成一个验证码挑战并存储答案，返回给前端渲染所需字段。
func (a *App) buildCaptcha() gin.H {
	id := newCaptchaID()
	if a.captchaType() == "arithmetic" {
		question, answer := genArithmetic(a.getSetting(cfgCaptchaArithHard) == "true")
		a.storeCaptcha(id, answer)
		return gin.H{"required": true, "id": id, "type": "arithmetic", "question": question}
	}
	length := atoiDefault(a.getSetting(cfgCaptchaLength), 4)
	if length < 4 {
		length = 4
	} else if length > 6 {
		length = 6
	}
	noise := atoiDefault(a.getSetting(cfgCaptchaNoise), 1)
	if noise < 0 {
		noise = 0
	} else if noise > 3 {
		noise = 3
	}
	text := genCaptchaText(length, a.getSetting(cfgCaptchaCharset))
	a.storeCaptcha(id, text)
	svg := renderCaptchaSVG(text, noise)
	image := "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte(svg))
	return gin.H{"required": true, "id": id, "type": "image", "image": image}
}

// checkCaptcha 场景开启验证码时校验；未开启直接放行。
func (a *App) checkCaptcha(scene, id, answer string) error {
	if !a.captchaEnabled(scene) {
		return nil
	}
	if strings.TrimSpace(id) == "" || strings.TrimSpace(answer) == "" {
		return errors.New("请输入验证码")
	}
	if !a.consumeCaptcha(id, answer) {
		return errors.New("验证码错误或已过期")
	}
	return nil
}

// NewCaptcha GET /captcha?scene=register|login|comment
// 场景未开启验证码返回 {required:false}；否则返回挑战。
func (a *App) NewCaptcha(c *gin.Context) {
	scene := c.Query("scene")
	if !a.captchaEnabled(scene) {
		ok(c, gin.H{"required": false})
		return
	}
	ok(c, a.buildCaptcha())
}

// ---- 管理员：验证码设置 ----

type captchaSettings struct {
	Type       string `json:"type"`
	Length     int    `json:"length"`
	Charset    string `json:"charset"`
	Noise      int    `json:"noise"`
	ArithHard  bool   `json:"arith_hard"`
	OnRegister bool   `json:"on_register"`
	OnLogin    bool   `json:"on_login"`
	OnComment  bool   `json:"on_comment"`
}

// GetCaptchaSettings GET /captcha-settings（管理员）
func (a *App) GetCaptchaSettings(c *gin.Context) {
	length := atoiDefault(a.getSetting(cfgCaptchaLength), 4)
	noise := atoiDefault(a.getSetting(cfgCaptchaNoise), 1)
	charset := a.getSetting(cfgCaptchaCharset)
	if charset != "digit" {
		charset = "alnum"
	}
	ok(c, captchaSettings{
		Type:       a.captchaType(),
		Length:     length,
		Charset:    charset,
		Noise:      noise,
		ArithHard:  a.getSetting(cfgCaptchaArithHard) == "true",
		OnRegister: a.getSetting(cfgCaptchaOnRegister) == "true",
		OnLogin:    a.getSetting(cfgCaptchaOnLogin) == "true",
		OnComment:  a.getSetting(cfgCaptchaOnComment) == "true",
	})
}

// UpdateCaptchaSettings PUT /captcha-settings（管理员）
func (a *App) UpdateCaptchaSettings(c *gin.Context) {
	var req captchaSettings
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if req.Type != "arithmetic" {
		req.Type = "image"
	}
	if req.Length < 4 {
		req.Length = 4
	} else if req.Length > 6 {
		req.Length = 6
	}
	if req.Noise < 0 {
		req.Noise = 0
	} else if req.Noise > 3 {
		req.Noise = 3
	}
	if req.Charset != "digit" {
		req.Charset = "alnum"
	}
	boolStr := func(v bool) string {
		if v {
			return "true"
		}
		return "false"
	}
	_ = a.setSetting(cfgCaptchaType, req.Type, "验证码类型：image|arithmetic")
	_ = a.setSetting(cfgCaptchaLength, strconv.Itoa(req.Length), "图形验证码字符数")
	_ = a.setSetting(cfgCaptchaCharset, req.Charset, "图形验证码字符集：digit|alnum")
	_ = a.setSetting(cfgCaptchaNoise, strconv.Itoa(req.Noise), "图形验证码干扰强度 0-3")
	_ = a.setSetting(cfgCaptchaArithHard, boolStr(req.ArithHard), "算术验证码高难度")
	_ = a.setSetting(cfgCaptchaOnRegister, boolStr(req.OnRegister), "注册开启验证码")
	_ = a.setSetting(cfgCaptchaOnLogin, boolStr(req.OnLogin), "登录开启验证码")
	_ = a.setSetting(cfgCaptchaOnComment, boolStr(req.OnComment), "评论开启验证码")
	a.GetCaptchaSettings(c)
}
