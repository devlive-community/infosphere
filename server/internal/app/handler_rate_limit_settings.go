package app

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// 限流设置：把内置限流策略的「上限/窗口」暴露为系统配置，管理员可在后台调整（存 site_configs）。

type rateLimitPolicyView struct {
	Name          string `json:"name"`
	Limit         int    `json:"limit"`          // 当前生效上限（含覆盖）
	WindowSeconds int    `json:"window_seconds"` // 当前生效窗口（秒）
	DefaultLimit  int    `json:"default_limit"`  // 内置默认上限
	DefaultWindow int    `json:"default_window"` // 内置默认窗口（秒）
	ByUser        bool   `json:"by_user"`        // 是否按用户维度（否则按 IP）
}

// AdminGetRateLimits GET /admin/rate-limits 列出全部限流策略及生效值。
func (a *App) AdminGetRateLimits(c *gin.Context) {
	items := make([]rateLimitPolicyView, 0, len(allRateLimitPolicies))
	for _, p := range allRateLimitPolicies {
		limit, window := a.effectiveRateLimit(*p)
		items = append(items, rateLimitPolicyView{
			Name: p.Name, Limit: limit, WindowSeconds: int(window.Seconds()),
			DefaultLimit: p.Limit, DefaultWindow: int(p.Window.Seconds()), ByUser: p.ByUser,
		})
	}
	ok(c, gin.H{"enabled": a.rateLimitEnabled(), "policies": items})
}

type rateLimitUpdate struct {
	Enabled  *bool `json:"enabled"`
	Policies []struct {
		Name          string `json:"name"`
		Limit         int    `json:"limit"`
		WindowSeconds int    `json:"window_seconds"`
	} `json:"policies"`
}

// AdminUpdateRateLimits PUT /admin/rate-limits 保存限流全局开关与各策略上限/窗口。
func (a *App) AdminUpdateRateLimits(c *gin.Context) {
	var req rateLimitUpdate
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	valid := map[string]bool{}
	for _, p := range allRateLimitPolicies {
		valid[p.Name] = true
	}
	if req.Enabled != nil {
		v := "true"
		if !*req.Enabled {
			v = "false"
		}
		_ = a.setSetting("ratelimit_enabled", v, "限流总开关")
	}
	for _, p := range req.Policies {
		if !valid[p.Name] || p.Limit < 1 || p.WindowSeconds < 1 {
			continue
		}
		_ = a.setSetting("ratelimit_"+p.Name+"_limit", strconv.Itoa(p.Limit), p.Name+" 限流上限")
		_ = a.setSetting("ratelimit_"+p.Name+"_window", strconv.Itoa(p.WindowSeconds), p.Name+" 限流窗口(秒)")
	}
	a.recordAudit(c, "ratelimit.updated", "config", "rate-limits", "限流设置", nil)
	a.AdminGetRateLimits(c)
}
