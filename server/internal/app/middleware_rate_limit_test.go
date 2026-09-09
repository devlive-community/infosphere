package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

type allowAllRateLimitStore struct{}

func (allowAllRateLimitStore) Take(_ string, limit int, window time.Duration, _ time.Time) (bool, int, time.Duration) {
	return true, limit, window
}

func TestMemoryRateLimitStoreWindowAndReset(t *testing.T) {
	store := newMemoryRateLimitStore()
	now := time.Date(2026, 9, 9, 10, 0, 0, 0, time.UTC)

	for expectedRemaining := 2; expectedRemaining >= 0; expectedRemaining-- {
		allowed, remaining, _ := store.Take("test-key", 3, time.Minute, now)
		if !allowed || remaining != expectedRemaining {
			t.Fatalf("第 %d 次请求结果异常: allowed=%v remaining=%d", 3-expectedRemaining, allowed, remaining)
		}
	}
	allowed, remaining, retryAfter := store.Take("test-key", 3, time.Minute, now.Add(10*time.Second))
	if allowed || remaining != 0 || retryAfter != 50*time.Second {
		t.Fatalf("超限结果异常: allowed=%v remaining=%d retry=%s", allowed, remaining, retryAfter)
	}
	allowed, remaining, _ = store.Take("test-key", 3, time.Minute, now.Add(time.Minute))
	if !allowed || remaining != 2 {
		t.Fatalf("窗口到期后应恢复额度: allowed=%v remaining=%d", allowed, remaining)
	}
}

func TestMemoryRateLimitStoreConcurrentLimit(t *testing.T) {
	store := newMemoryRateLimitStore()
	now := time.Date(2026, 9, 9, 10, 0, 0, 0, time.UTC)
	var allowedCount atomic.Int64
	var wg sync.WaitGroup
	for range 100 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			allowed, _, _ := store.Take("shared-key", 10, time.Minute, now)
			if allowed {
				allowedCount.Add(1)
			}
		}()
	}
	wg.Wait()
	if allowedCount.Load() != 10 {
		t.Fatalf("并发请求应严格只放行 10 次，实际 %d", allowedCount.Load())
	}
}

func TestRateLimitMiddlewareResponseAndSafeKey(t *testing.T) {
	gin.SetMode(gin.TestMode)
	a := &App{RateLimits: newMemoryRateLimitStore()}
	policy := rateLimitPolicy{Name: "test-login", Limit: 1, Window: time.Minute, Message: "请求过于频繁"}
	r := gin.New()
	_ = r.SetTrustedProxies(nil)
	handled := 0
	r.POST("/login", a.RateLimit(policy), func(c *gin.Context) {
		handled++
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	request := func(body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/login", strings.NewReader(body))
		req.RemoteAddr = "203.0.113.7:42000"
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}
	if first := request(`{"username":"alice","password":"first-secret"}`); first.Code != http.StatusOK {
		t.Fatalf("首次请求应放行: %d", first.Code)
	}
	second := request(`{"username":"other@example.com","password":"second-secret"}`)
	if second.Code != http.StatusTooManyRequests || second.Header().Get("Retry-After") == "" || handled != 1 {
		t.Fatalf("超限响应异常: code=%d retry=%q handled=%d", second.Code, second.Header().Get("Retry-After"), handled)
	}
	var payload map[string]any
	if err := json.Unmarshal(second.Body.Bytes(), &payload); err != nil || payload["code"] != "RATE_LIMITED" || payload["retry_after"] == nil {
		t.Fatalf("429 响应体异常: %s", second.Body.String())
	}

	store := a.RateLimits.(*memoryRateLimitStore)
	for key := range store.entries {
		if strings.Contains(key, "secret") || strings.Contains(key, "alice") || strings.Contains(key, "example.com") {
			t.Fatalf("限流键泄露了请求正文: %q", key)
		}
	}
}

func TestRateLimitUsesAuthenticatedUserAndTrustedProxyPolicy(t *testing.T) {
	gin.SetMode(gin.TestMode)
	policy := rateLimitPolicy{Name: "test-action", Limit: 1, Window: time.Minute, ByUser: true, Message: "操作过于频繁"}
	a := &App{RateLimits: newMemoryRateLimitStore()}
	r := gin.New()
	_ = r.SetTrustedProxies(nil)
	r.Use(func(c *gin.Context) {
		id := uint(1)
		if c.GetHeader("X-Test-User") == "2" {
			id = 2
		}
		c.Set("user", &models.User{ID: id})
		c.Next()
	})
	r.POST("/action", a.RateLimit(policy), func(c *gin.Context) { c.Status(http.StatusNoContent) })

	call := func(user string) int {
		req := httptest.NewRequest(http.MethodPost, "/action", nil)
		req.RemoteAddr = "203.0.113.9:43000"
		req.Header.Set("X-Test-User", user)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w.Code
	}
	if call("1") != http.StatusNoContent || call("2") != http.StatusNoContent || call("1") != http.StatusTooManyRequests {
		t.Fatal("登录后的限流应按用户 ID 隔离，而不是按共享 IP")
	}

	// 默认不信任 X-Forwarded-For；同一连接伪造不同地址仍共享额度。
	t.Setenv("INFO_SPHERE_TRUSTED_PROXIES", "")
	ipApp := &App{RateLimits: newMemoryRateLimitStore()}
	ipRouter := gin.New()
	configureTrustedProxies(ipRouter)
	ipPolicy := rateLimitPolicy{Name: "test-ip", Limit: 1, Window: time.Minute, Message: "操作过于频繁"}
	ipRouter.POST("/ip", ipApp.RateLimit(ipPolicy), func(c *gin.Context) { c.Status(http.StatusNoContent) })
	callIP := func(forwarded string) int {
		req := httptest.NewRequest(http.MethodPost, "/ip", nil)
		req.RemoteAddr = "203.0.113.10:44000"
		req.Header.Set("X-Forwarded-For", forwarded)
		w := httptest.NewRecorder()
		ipRouter.ServeHTTP(w, req)
		return w.Code
	}
	if callIP("198.51.100.1") != http.StatusNoContent || callIP("198.51.100.2") != http.StatusTooManyRequests {
		t.Fatal("未配置受信代理时不应信任 X-Forwarded-For")
	}

	// 显式信任代理后，才使用该代理传入的客户端地址。
	t.Setenv("INFO_SPHERE_TRUSTED_PROXIES", "203.0.113.10")
	trustedApp := &App{RateLimits: newMemoryRateLimitStore()}
	trustedRouter := gin.New()
	configureTrustedProxies(trustedRouter)
	trustedRouter.POST("/ip", trustedApp.RateLimit(ipPolicy), func(c *gin.Context) { c.Status(http.StatusNoContent) })
	callTrusted := func(forwarded string) int {
		req := httptest.NewRequest(http.MethodPost, "/ip", nil)
		req.RemoteAddr = "203.0.113.10:44000"
		req.Header.Set("X-Forwarded-For", forwarded)
		w := httptest.NewRecorder()
		trustedRouter.ServeHTTP(w, req)
		return w.Code
	}
	if callTrusted("198.51.100.1") != http.StatusNoContent || callTrusted("198.51.100.2") != http.StatusNoContent {
		t.Fatal("受信代理后的不同客户端地址应使用独立额度")
	}
}
