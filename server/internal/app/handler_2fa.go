package app

import (
	"bytes"
	crand "crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"image/png"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/pquerna/otp/totp"
)

// 二次认证（TOTP）：用户开启后，可逐操作要求二次验证（step-up）。
// 保护操作键（用户逐项开关）：
const (
	tfOpLogin        = "login"         // 登录
	tfOpCredentials  = "credentials"   // 修改密码/邮箱
	tfOpDelete       = "delete"        // 删除/永久删除书籍、章节
	tfOpUnbindExport = "unbind_export" // 解绑第三方 / 导出数据
)

var twoFactorOps = map[string]bool{tfOpLogin: true, tfOpCredentials: true, tfOpDelete: true, tfOpUnbindExport: true}

const (
	stepUpTTL     = 5 * time.Minute
	backupCodeQty = 10
)

func tfOpSet(csv string) map[string]bool {
	set := map[string]bool{}
	for _, k := range strings.Split(csv, ",") {
		if k = strings.TrimSpace(k); twoFactorOps[k] {
			set[k] = true
		}
	}
	return set
}

func tfOpEnabled(csv, op string) bool { return tfOpSet(csv)[op] }

// ---- step-up 授权窗口（进程内存，5 分钟）----
type stepUpStore struct {
	mu sync.Mutex
	m  map[uint]time.Time
}

var stepUps = &stepUpStore{m: make(map[uint]time.Time)}

func (s *stepUpStore) grant(uid uint) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.m[uid] = time.Now().Add(stepUpTTL)
}

func (s *stepUpStore) valid(uid uint) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	exp, ok := s.m[uid]
	return ok && time.Now().Before(exp)
}

func (s *stepUpStore) clear(uid uint) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.m, uid)
}

// ---- 校验 ----

// validateUserTOTP 校验 TOTP 动态码或一次性备用码。
func (a *App) validateUserTOTP(u *models.User, code string) bool {
	code = strings.TrimSpace(code)
	if u.TwoFactorSecret != "" && totp.Validate(code, u.TwoFactorSecret) {
		return true
	}
	return a.consumeBackupCode(u.ID, code)
}

func (a *App) consumeBackupCode(uid uint, code string) bool {
	code = strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(code), "-", ""))
	if len(code) < 8 {
		return false
	}
	sum := sha256.Sum256([]byte(code))
	var bc models.TwoFactorBackupCode
	if err := a.DB.Where("user_id = ? AND code_hash = ? AND used_at IS NULL", uid, hex.EncodeToString(sum[:])).First(&bc).Error; err != nil {
		return false
	}
	a.DB.Model(&bc).Update("used_at", time.Now())
	return true
}

// requireStepUp 保护操作前置：开启 2FA 且该操作被勾选、且近 5 分钟未验证 → 拒绝并要求二次认证。
// 返回 false 表示已写出 403，调用方应直接 return。
func (a *App) requireStepUp(c *gin.Context, op string) bool {
	u := currentUser(c)
	if u == nil || !u.TwoFactorEnabled || !tfOpEnabled(u.TwoFactorOps, op) {
		return true
	}
	if stepUps.valid(u.ID) {
		return true
	}
	c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
		"success": false, "code": "TWO_FACTOR_REQUIRED", "message": "该操作需要二次认证",
	})
	return false
}

// ---- 备用码 ----

func genBackupCode() string {
	const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, 10)
	for i := range b {
		idx, err := crand.Int(crand.Reader, big.NewInt(int64(len(alpha))))
		if err != nil {
			b[i] = alpha[0]
			continue
		}
		b[i] = alpha[idx.Int64()]
	}
	return string(b)
}

// issueBackupCodes 重置并生成一批备用码；明文仅此一次返回，数据库存哈希。
func (a *App) issueBackupCodes(uid uint) []string {
	a.DB.Where("user_id = ?", uid).Delete(&models.TwoFactorBackupCode{})
	codes := make([]string, backupCodeQty)
	for i := range codes {
		raw := genBackupCode()
		codes[i] = raw[:5] + "-" + raw[5:]
		sum := sha256.Sum256([]byte(raw))
		a.DB.Create(&models.TwoFactorBackupCode{UserID: uid, CodeHash: hex.EncodeToString(sum[:])})
	}
	return codes
}

// ---- 用户端接口 ----

// GetTwoFactor GET /auth/2fa 二次认证状态与已勾选操作。
func (a *App) GetTwoFactor(c *gin.Context) {
	u := currentUser(c)
	ops := make([]string, 0)
	for k := range tfOpSet(u.TwoFactorOps) {
		ops = append(ops, k)
	}
	ok(c, gin.H{"enabled": u.TwoFactorEnabled, "operations": ops})
}

// SetupTwoFactor POST /auth/2fa/setup 预配置：生成密钥与二维码（尚未开启）。
func (a *App) SetupTwoFactor(c *gin.Context) {
	u := currentUser(c)
	if u.TwoFactorEnabled {
		fail(c, http.StatusBadRequest, "二次认证已开启")
		return
	}
	issuer := strings.TrimSpace(a.getSetting("site_name"))
	if issuer == "" {
		issuer = "InfoSphere"
	}
	key, err := totp.Generate(totp.GenerateOpts{Issuer: issuer, AccountName: u.Username})
	if err != nil {
		fail(c, http.StatusInternalServerError, "生成密钥失败")
		return
	}
	a.DB.Model(u).Update("two_factor_secret", key.Secret())
	qr := ""
	if img, err := key.Image(220, 220); err == nil {
		var buf bytes.Buffer
		if png.Encode(&buf, img) == nil {
			qr = "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes())
		}
	}
	ok(c, gin.H{"secret": key.Secret(), "otpauth_url": key.URL(), "qr": qr})
}

type twoFactorCodeRequest struct {
	Code string `json:"code"`
}

// EnableTwoFactor POST /auth/2fa/enable 校验动态码后开启；默认勾选全部敏感操作，返回备用码（仅此一次）。
func (a *App) EnableTwoFactor(c *gin.Context) {
	u := currentUser(c)
	var req twoFactorCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if u.TwoFactorSecret == "" {
		fail(c, http.StatusBadRequest, "请先扫码配置验证器")
		return
	}
	if !totp.Validate(strings.TrimSpace(req.Code), u.TwoFactorSecret) {
		fail(c, http.StatusBadRequest, "验证码错误")
		return
	}
	a.DB.Model(u).Updates(map[string]any{
		"two_factor_enabled": true,
		"two_factor_ops":     strings.Join([]string{tfOpLogin, tfOpCredentials, tfOpDelete, tfOpUnbindExport}, ","),
	})
	stepUps.grant(u.ID)
	ok(c, gin.H{"enabled": true, "backup_codes": a.issueBackupCodes(u.ID)})
}

// DisableTwoFactor POST /auth/2fa/disable 校验后关闭并清除密钥与备用码。
func (a *App) DisableTwoFactor(c *gin.Context) {
	u := currentUser(c)
	var req twoFactorCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if !u.TwoFactorEnabled || !a.validateUserTOTP(u, req.Code) {
		fail(c, http.StatusBadRequest, "验证码错误")
		return
	}
	a.DB.Model(u).Updates(map[string]any{"two_factor_enabled": false, "two_factor_secret": "", "two_factor_ops": ""})
	a.DB.Where("user_id = ?", u.ID).Delete(&models.TwoFactorBackupCode{})
	stepUps.clear(u.ID)
	ok(c, gin.H{"enabled": false})
}

// UpdateTwoFactorOps PUT /auth/2fa/operations 保存需要二次认证的操作集合。
func (a *App) UpdateTwoFactorOps(c *gin.Context) {
	u := currentUser(c)
	if !u.TwoFactorEnabled {
		fail(c, http.StatusBadRequest, "请先开启二次认证")
		return
	}
	var req struct {
		Operations []string `json:"operations"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	valid := make([]string, 0, len(req.Operations))
	for _, k := range req.Operations {
		if twoFactorOps[k] {
			valid = append(valid, k)
		}
	}
	a.DB.Model(u).Update("two_factor_ops", strings.Join(valid, ","))
	ok(c, gin.H{"operations": valid})
}

// VerifyTwoFactor POST /auth/2fa/verify step-up 验证，成功后授予 5 分钟窗口。
func (a *App) VerifyTwoFactor(c *gin.Context) {
	u := currentUser(c)
	if !u.TwoFactorEnabled {
		fail(c, http.StatusBadRequest, "未开启二次认证")
		return
	}
	var req twoFactorCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if !a.validateUserTOTP(u, req.Code) {
		fail(c, http.StatusBadRequest, "验证码错误或已失效")
		return
	}
	stepUps.grant(u.ID)
	ok(c, gin.H{"verified": true})
}

// RegenerateBackupCodes POST /auth/2fa/backup-codes 校验后重置备用码。
func (a *App) RegenerateBackupCodes(c *gin.Context) {
	u := currentUser(c)
	var req twoFactorCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if !u.TwoFactorEnabled || !a.validateUserTOTP(u, req.Code) {
		fail(c, http.StatusBadRequest, "验证码错误")
		return
	}
	ok(c, gin.H{"backup_codes": a.issueBackupCodes(u.ID)})
}
