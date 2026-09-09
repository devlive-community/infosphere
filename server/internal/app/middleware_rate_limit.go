package app

import (
	"crypto/sha256"
	"encoding/hex"
	"log"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// RateLimitStore 隔离限流状态存储。当前使用进程内实现；多实例部署可替换为共享存储。
type RateLimitStore interface {
	Take(key string, limit int, window time.Duration, now time.Time) (allowed bool, remaining int, retryAfter time.Duration)
}

type rateLimitEntry struct {
	Count   int
	ResetAt time.Time
}

type memoryRateLimitStore struct {
	mu         sync.Mutex
	entries    map[string]rateLimitEntry
	operations uint64
}

func newMemoryRateLimitStore() RateLimitStore {
	return &memoryRateLimitStore{entries: map[string]rateLimitEntry{}}
}

func (s *memoryRateLimitStore) Take(key string, limit int, window time.Duration, now time.Time) (bool, int, time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.operations++
	if s.operations%256 == 0 {
		for existingKey, entry := range s.entries {
			if !now.Before(entry.ResetAt) {
				delete(s.entries, existingKey)
			}
		}
	}

	entry, exists := s.entries[key]
	if !exists || !now.Before(entry.ResetAt) {
		entry = rateLimitEntry{ResetAt: now.Add(window)}
	}
	if entry.Count >= limit {
		s.entries[key] = entry
		return false, 0, entry.ResetAt.Sub(now)
	}
	entry.Count++
	s.entries[key] = entry
	return true, limit - entry.Count, entry.ResetAt.Sub(now)
}

type rateLimitPolicy struct {
	Name    string
	Limit   int
	Window  time.Duration
	ByUser  bool
	Message string
}

var (
	loginRateLimit = rateLimitPolicy{
		Name: "auth-login", Limit: 10, Window: 5 * time.Minute,
		Message: "登录尝试过于频繁，请稍后再试",
	}
	registerRateLimit = rateLimitPolicy{
		Name: "auth-register", Limit: 5, Window: time.Hour,
		Message: "注册请求过于频繁，请稍后再试",
	}
	passwordForgotRateLimit = rateLimitPolicy{
		Name: "password-forgot", Limit: 5, Window: time.Hour,
		Message: "找回密码请求过于频繁，请稍后再试",
	}
	passwordResetRateLimit = rateLimitPolicy{
		Name: "password-reset", Limit: 10, Window: time.Hour,
		Message: "密码重置请求过于频繁，请稍后再试",
	}
	commentRateLimit = rateLimitPolicy{
		Name: "comment-create", Limit: 30, Window: time.Minute, ByUser: true,
		Message: "评论发布过于频繁，请稍后再试",
	}
	reactionRateLimit = rateLimitPolicy{
		Name: "reaction-update", Limit: 120, Window: time.Minute, ByUser: true,
		Message: "互动操作过于频繁，请稍后再试",
	}
	uploadRateLimit = rateLimitPolicy{
		Name: "upload-create", Limit: 20, Window: time.Minute, ByUser: true,
		Message: "上传操作过于频繁，请稍后再试",
	}
	reportRateLimit = rateLimitPolicy{
		Name: "report-create", Limit: 20, Window: time.Hour, ByUser: true,
		Message: "举报提交过于频繁，请稍后再试",
	}
)

// configureTrustedProxies 默认不信任任何转发头。部署在反向代理后时，需显式配置代理 IP/CIDR。
func configureTrustedProxies(r *gin.Engine) {
	raw := strings.TrimSpace(os.Getenv("INFO_SPHERE_TRUSTED_PROXIES"))
	if raw == "" {
		_ = r.SetTrustedProxies(nil)
		return
	}
	parts := strings.Split(raw, ",")
	proxies := make([]string, 0, len(parts))
	for _, part := range parts {
		if value := strings.TrimSpace(part); value != "" {
			proxies = append(proxies, value)
		}
	}
	if err := r.SetTrustedProxies(proxies); err != nil {
		log.Printf("[security] INFO_SPHERE_TRUSTED_PROXIES 无效，已禁用转发头信任: %v", err)
		_ = r.SetTrustedProxies(nil)
	}
}

func rateLimitKey(policy rateLimitPolicy, c *gin.Context) string {
	subject := "ip:" + c.ClientIP()
	if policy.ByUser {
		if u := currentUser(c); u != nil {
			subject = "user:" + strconv.FormatUint(uint64(u.ID), 10)
		}
	}
	// 存储中只保留不可逆摘要，绝不拼接密码、令牌、邮箱或请求正文。
	sum := sha256.Sum256([]byte(policy.Name + "\x00" + subject))
	return policy.Name + ":" + hex.EncodeToString(sum[:])
}

func (a *App) RateLimit(policy rateLimitPolicy) gin.HandlerFunc {
	if a.RateLimits == nil {
		a.RateLimits = newMemoryRateLimitStore()
	}
	return func(c *gin.Context) {
		allowed, remaining, wait := a.RateLimits.Take(rateLimitKey(policy, c), policy.Limit, policy.Window, currentTime())
		retrySeconds := int(math.Ceil(wait.Seconds()))
		if retrySeconds < 1 {
			retrySeconds = 1
		}
		c.Header("X-RateLimit-Limit", strconv.Itoa(policy.Limit))
		c.Header("X-RateLimit-Remaining", strconv.Itoa(remaining))
		if !allowed {
			c.Header("Retry-After", strconv.Itoa(retrySeconds))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"success":     false,
				"code":        "RATE_LIMITED",
				"message":     policy.Message,
				"retry_after": retrySeconds,
			})
			return
		}
		c.Next()
	}
}
