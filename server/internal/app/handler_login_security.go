package app

import (
	"errors"
	"fmt"
	"net/http"
	"time"
	"unicode"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm/clause"
)

// 登录安全：登录失败锁定 + 密码策略，存 site_configs。
const (
	cfgLockoutEnabled   = "login_lockout_enabled"
	cfgLockoutThreshold = "login_lockout_threshold" // 连续失败次数
	cfgLockoutWindow    = "login_lockout_window"    // 统计窗口（分钟）
	cfgLockoutDuration  = "login_lockout_duration"  // 锁定时长（分钟）
	cfgPwdMinLength     = "password_min_length"
	cfgPwdRequireMixed  = "password_require_mixed" // 需同时含字母与数字
)

// ---- 密码策略 ----

func (a *App) passwordMinLength() int {
	n := atoiDefault(a.getSetting(cfgPwdMinLength), 6)
	if n < 6 {
		n = 6
	} else if n > 64 {
		n = 64
	}
	return n
}

func (a *App) passwordRequireMixed() bool { return a.getSetting(cfgPwdRequireMixed) == "true" }

// validatePassword 按站点策略校验密码；不满足返回可展示的错误。
func (a *App) validatePassword(pw string) error {
	if len([]rune(pw)) < a.passwordMinLength() {
		return fmt.Errorf("密码至少 %d 位", a.passwordMinLength())
	}
	if a.passwordRequireMixed() {
		var hasLetter, hasDigit bool
		for _, r := range pw {
			if unicode.IsLetter(r) {
				hasLetter = true
			}
			if unicode.IsDigit(r) {
				hasDigit = true
			}
		}
		if !hasLetter || !hasDigit {
			return errors.New("密码需同时包含字母和数字")
		}
	}
	return nil
}

// ---- 登录失败锁定 ----

func (a *App) lockoutEnabled() bool { return a.getSetting(cfgLockoutEnabled) == "true" }

func (a *App) lockoutThreshold() int {
	n := atoiDefault(a.getSetting(cfgLockoutThreshold), 5)
	if n < 1 {
		n = 5
	}
	return n
}

func (a *App) lockoutWindow() time.Duration {
	n := atoiDefault(a.getSetting(cfgLockoutWindow), 15)
	if n < 1 {
		n = 15
	}
	return time.Duration(n) * time.Minute
}

func (a *App) lockoutDuration() time.Duration {
	n := atoiDefault(a.getSetting(cfgLockoutDuration), 15)
	if n < 1 {
		n = 15
	}
	return time.Duration(n) * time.Minute
}

// loginLockRemaining 账户剩余锁定时间；0 表示未锁定。
func (a *App) loginLockRemaining(username string) time.Duration {
	if !a.lockoutEnabled() {
		return 0
	}
	var l models.LoginLockout
	if a.DB.Where("username = ?", username).First(&l).Error != nil {
		return 0
	}
	if l.LockedUntil.After(time.Now()) {
		return time.Until(l.LockedUntil)
	}
	return 0
}

// recordLoginFailure 记一次失败：窗口内累计到阈值则锁定一段时间。
func (a *App) recordLoginFailure(username string) {
	if !a.lockoutEnabled() {
		return
	}
	now := time.Now()
	var l models.LoginLockout
	if a.DB.Where("username = ?", username).First(&l).Error != nil {
		l = models.LoginLockout{Username: username, WindowStart: now}
	}
	if now.Sub(l.WindowStart) > a.lockoutWindow() {
		l.Fails = 0
		l.WindowStart = now
	}
	l.Fails++
	if l.Fails >= a.lockoutThreshold() {
		l.LockedUntil = now.Add(a.lockoutDuration())
		l.Fails = 0
		l.WindowStart = now
	}
	a.DB.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "username"}}, UpdateAll: true}).Create(&l)
}

func (a *App) clearLoginFailures(username string) {
	a.DB.Where("username = ?", username).Delete(&models.LoginLockout{})
}

// ---- 管理员：登录安全设置 ----

type loginSecuritySettings struct {
	LockoutEnabled       bool `json:"lockout_enabled"`
	LockoutThreshold     int  `json:"lockout_threshold"`
	LockoutWindow        int  `json:"lockout_window"`
	LockoutDuration      int  `json:"lockout_duration"`
	PasswordMinLength    int  `json:"password_min_length"`
	PasswordRequireMixed bool `json:"password_require_mixed"`
}

// GetLoginSecurity GET /login-security（管理员）
func (a *App) GetLoginSecurity(c *gin.Context) {
	ok(c, loginSecuritySettings{
		LockoutEnabled:       a.lockoutEnabled(),
		LockoutThreshold:     a.lockoutThreshold(),
		LockoutWindow:        int(a.lockoutWindow().Minutes()),
		LockoutDuration:      int(a.lockoutDuration().Minutes()),
		PasswordMinLength:    a.passwordMinLength(),
		PasswordRequireMixed: a.passwordRequireMixed(),
	})
}

// UpdateLoginSecurity PUT /login-security（管理员）
func (a *App) UpdateLoginSecurity(c *gin.Context) {
	var req loginSecuritySettings
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	clampi := func(v, lo, hi int) int {
		if v < lo {
			return lo
		} else if v > hi {
			return hi
		}
		return v
	}
	boolStr := func(v bool) string {
		if v {
			return "true"
		}
		return "false"
	}
	_ = a.setSetting(cfgLockoutEnabled, boolStr(req.LockoutEnabled), "登录失败锁定开关")
	_ = a.setSetting(cfgLockoutThreshold, fmt.Sprintf("%d", clampi(req.LockoutThreshold, 1, 20)), "登录连续失败锁定阈值")
	_ = a.setSetting(cfgLockoutWindow, fmt.Sprintf("%d", clampi(req.LockoutWindow, 1, 1440)), "登录失败统计窗口（分钟）")
	_ = a.setSetting(cfgLockoutDuration, fmt.Sprintf("%d", clampi(req.LockoutDuration, 1, 1440)), "登录锁定时长（分钟）")
	_ = a.setSetting(cfgPwdMinLength, fmt.Sprintf("%d", clampi(req.PasswordMinLength, 6, 64)), "密码最小长度")
	_ = a.setSetting(cfgPwdRequireMixed, boolStr(req.PasswordRequireMixed), "密码需同时含字母与数字")
	a.GetLoginSecurity(c)
}
