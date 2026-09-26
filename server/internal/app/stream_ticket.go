package app

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"knowforge/server/internal/models"
)

// 事件流凭证：EventSource 无法携带请求头，事件流接口（站内通知、问答进度等）改用短时凭证放在 URL 中，
// 不再把长期登录令牌暴露在地址里（会进入代理与访问日志）。凭证为 HMAC 签名的「用户 + 过期时间」，
// 只用于建立事件流连接（签名带用途前缀，不能当作 API 令牌），60 秒内有效；已建立的连接不受过期影响。
// 无状态校验，多实例部署也可用。

const (
	streamTicketTTL    = 60 * time.Second
	streamTicketPrefix = "knowforge-stream-ticket:"
)

func (a *App) streamTicketMAC(payload string) string {
	mac := hmac.New(sha256.New, []byte(a.Config.Secret))
	mac.Write([]byte(streamTicketPrefix + payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// issueStreamTicket 签发事件流凭证：base64url("用户ID.过期秒.随机数") + "." + 签名。
func (a *App) issueStreamTicket(userID uint, now time.Time) string {
	nonce := make([]byte, 6)
	_, _ = rand.Read(nonce)
	payload := fmt.Sprintf("%d.%d.%s", userID, now.Add(streamTicketTTL).Unix(), hex.EncodeToString(nonce))
	return base64.RawURLEncoding.EncodeToString([]byte(payload)) + "." + a.streamTicketMAC(payload)
}

// parseStreamTicket 校验签名与有效期，返回用户 ID。
func (a *App) parseStreamTicket(ticket string, now time.Time) (uint, error) {
	encoded, sig, ok := strings.Cut(ticket, ".")
	if !ok {
		return 0, errors.New("凭证格式无效")
	}
	raw, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return 0, errors.New("凭证格式无效")
	}
	payload := string(raw)
	if !hmac.Equal([]byte(sig), []byte(a.streamTicketMAC(payload))) {
		return 0, errors.New("凭证签名无效")
	}
	parts := strings.Split(payload, ".")
	if len(parts) != 3 {
		return 0, errors.New("凭证格式无效")
	}
	uid, err1 := strconv.ParseUint(parts[0], 10, 64)
	exp, err2 := strconv.ParseInt(parts[1], 10, 64)
	if err1 != nil || err2 != nil || uid == 0 {
		return 0, errors.New("凭证格式无效")
	}
	if now.Unix() > exp {
		return 0, errors.New("凭证已过期")
	}
	return uint(uid), nil
}

// streamUser 事件流连接的用户：请求头/Cookie 登录态，或 ?ticket= 事件流凭证（账号须启用）。
func (a *App) streamUser(c *gin.Context) *models.User {
	if u := a.resolveUser(c); u != nil {
		return u
	}
	ticket := strings.TrimSpace(c.Query("ticket"))
	if ticket == "" {
		return nil
	}
	uid, err := a.parseStreamTicket(ticket, time.Now())
	if err != nil {
		return nil
	}
	var u models.User
	if a.DB.First(&u, uid).Error != nil || !u.IsActive {
		return nil
	}
	return &u
}

// IssueStreamTicket POST /stream-tickets 为当前登录用户签发事件流凭证。
func (a *App) IssueStreamTicket(c *gin.Context) {
	u := currentUser(c)
	ok(c, gin.H{"ticket": a.issueStreamTicket(u.ID, time.Now()), "expires_in": int(streamTicketTTL / time.Second)})
}

// failStream 事件流鉴权失败。
func failStream(c *gin.Context) {
	c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"success": false, "message": "事件流凭证无效或已过期"})
}
