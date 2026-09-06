package app

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"infosphere/server/internal/mail"
	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

// M15 邮件与找回密码：
//   - SMTP 凭据存站点配置（mail_* / smtp_* 键），管理员经 /admin/mail 维护
//   - 找回链接一次性、60 分钟有效；数据库只存 SHA-256 哈希
//   - forgot 响应不泄露邮箱是否存在；log 驱动时链接打印到后端日志（开发期用）

const passwordResetTTL = 60 * time.Minute

// mailSender 按站点配置解析发件器；测试可通过 App.MailSender 注入
func (a *App) mailSender() mail.Sender {
	if a.MailSender != nil {
		return a.MailSender
	}
	port, _ := strconv.Atoi(a.getSetting("smtp_port"))
	if port == 0 {
		port = 587
	}
	driver := a.getSetting("mail_driver")
	if driver == "" {
		driver = "log"
	}
	return mail.New(mail.Config{
		Driver:   driver,
		Host:     a.getSetting("smtp_host"),
		Port:     port,
		Username: a.getSetting("smtp_username"),
		Password: a.getSetting("smtp_password"),
		From:     a.getSetting("smtp_from"),
	})
}

// resetLinkBase 重置链接的前端地址：优先 site_url，回退到请求来源
func (a *App) resetLinkBase(c *gin.Context) string {
	base := strings.TrimRight(a.getSetting("site_url"), "/")
	if base == "" {
		base = frontendOrigin(c)
	}
	return base
}

type forgotPasswordRequest struct {
	Email string `json:"email"`
}

// ForgotPassword POST /auth/password/forgot 匿名申请找回密码
func (a *App) ForgotPassword(c *gin.Context) {
	var req forgotPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	email := strings.TrimSpace(strings.ToLower(req.Email))
	if !emailRegex.MatchString(email) {
		fail(c, http.StatusBadRequest, "邮箱格式不正确")
		return
	}

	generic := gin.H{"message": "如果该邮箱已注册，重置链接已发送，请在 60 分钟内完成重置"}

	var u models.User
	if err := a.DB.Where("email = ?", email).First(&u).Error; err != nil {
		// 邮箱不存在：与存在时返回一致的响应，不泄露账户信息
		ok(c, generic)
		return
	}

	// 单用户仅保留一个有效令牌：新申请作废旧令牌
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		fail(c, http.StatusInternalServerError, "生成令牌失败")
		return
	}
	token := hex.EncodeToString(raw)
	sum := sha256.Sum256([]byte(token))
	a.DB.Where("user_id = ? AND used_at IS NULL", u.ID).Delete(&models.PasswordResetToken{})
	if err := a.DB.Create(&models.PasswordResetToken{
		UserID:    u.ID,
		TokenHash: hex.EncodeToString(sum[:]),
		ExpiresAt: currentTime().Add(passwordResetTTL),
	}).Error; err != nil {
		fail(c, http.StatusInternalServerError, "生成令牌失败")
		return
	}

	link := a.resetLinkBase(c) + "/reset-password?token=" + token
	if err := a.mailSender().Send(email, "重置你的 InfoSphere 密码", mail.ResetPasswordHTML(link, 60)); err != nil {
		// 发信失败不暴露给调用方，仅记录日志便于排查 SMTP 配置
		log.Printf("[mail] 发送找回密码邮件失败 to=%s: %v", email, err)
	}
	ok(c, generic)
}

type resetPasswordRequest struct {
	Token    string `json:"token"`
	Password string `json:"password"`
}

// ResetPassword POST /auth/password/reset 匿名凭令牌重置密码
func (a *App) ResetPassword(c *gin.Context) {
	var req resetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	token := strings.TrimSpace(req.Token)
	if token == "" {
		fail(c, http.StatusBadRequest, "缺少重置令牌")
		return
	}
	if len(req.Password) < 6 {
		fail(c, http.StatusBadRequest, "密码至少 6 位")
		return
	}

	sum := sha256.Sum256([]byte(token))
	var record models.PasswordResetToken
	if err := a.DB.Where("token_hash = ?", hex.EncodeToString(sum[:])).First(&record).Error; err != nil ||
		record.UsedAt != nil || record.ExpiresAt.Before(currentTime()) {
		fail(c, http.StatusBadRequest, "重置链接无效或已过期，请重新申请")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		fail(c, http.StatusInternalServerError, "密码加密失败")
		return
	}
	if err := a.DB.Model(&models.User{}).Where("id = ?", record.UserID).Update("password", string(hash)).Error; err != nil {
		fail(c, http.StatusInternalServerError, "重置失败: "+err.Error())
		return
	}
	now := currentTime()
	a.DB.Model(&record).Update("used_at", now)
	// 其余未用令牌一并作废
	a.DB.Where("user_id = ? AND used_at IS NULL", record.UserID).Delete(&models.PasswordResetToken{})
	ok(c, gin.H{"message": "密码已重置，请使用新密码登录"})
}
