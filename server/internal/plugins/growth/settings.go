package growth

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"knowforge/server/internal/plugincore"
	"knowforge/server/internal/plugins"
)

// 成长插件的站点级设置（站点配置键值）：排行榜是否开放、上榜所需最少经验。
const (
	cfgLeaderboardEnabled = "growth_leaderboard_enabled"
	cfgLeaderboardMinXP   = "growth_leaderboard_min_xp"
	maxLeaderboardMinXP   = 1_000_000
)

type growthSettings struct {
	LeaderboardEnabled bool `json:"leaderboard_enabled"`
	LeaderboardMinXP   int  `json:"leaderboard_min_xp"`
}

func init() {
	// 公开站点配置：排行榜是否开放（插件启用且未关闭），前端据此显示导航/入口
	plugincore.RegisterPublicSiteConfig(func(core plugincore.Core) map[string]any {
		b := &behavior{core: core}
		return map[string]any{cfgLeaderboardEnabled: core.PluginEnabled(plugins.KeyGrowth) && b.settings().LeaderboardEnabled}
	})
}

// settings 读取成长设置：排行榜默认开放；最少上榜经验默认 1（即有经验即可上榜），不小于 1。
func (b *behavior) settings() growthSettings {
	s := growthSettings{LeaderboardEnabled: b.core.GetSetting(cfgLeaderboardEnabled) != "false", LeaderboardMinXP: 1}
	if v := b.core.AtoiDefault(b.core.GetSetting(cfgLeaderboardMinXP), 1); v > 1 {
		s.LeaderboardMinXP = v
	}
	return s
}

// AdminGetGrowthSettings GET /admin/growth/settings
func (b *behavior) AdminGetGrowthSettings(c *gin.Context) { b.core.OK(c, b.settings()) }

// AdminUpdateGrowthSettings PUT /admin/growth/settings {leaderboard_enabled, leaderboard_min_xp}
func (b *behavior) AdminUpdateGrowthSettings(c *gin.Context) {
	core := b.core
	var req growthSettings
	if err := c.ShouldBindJSON(&req); err != nil || req.LeaderboardMinXP < 1 || req.LeaderboardMinXP > maxLeaderboardMinXP {
		core.Fail(c, http.StatusBadRequest, "参数错误：最少上榜经验需为 1 到 1000000 之间的整数")
		return
	}
	if err := core.SetSetting(cfgLeaderboardEnabled, strconv.FormatBool(req.LeaderboardEnabled), "成长：经验排行榜是否开放"); err != nil {
		core.Fail(c, http.StatusInternalServerError, "保存失败")
		return
	}
	if err := core.SetSetting(cfgLeaderboardMinXP, strconv.Itoa(req.LeaderboardMinXP), "成长：上榜所需最少经验"); err != nil {
		core.Fail(c, http.StatusInternalServerError, "保存失败")
		return
	}
	core.RecordAudit(c, "growth.settings_updated", "growth", "settings", "成长设置", changedFields("leaderboard_enabled", "leaderboard_min_xp"))
	core.OK(c, b.settings())
}

// publicSettings 公开设置（/growth/settings）。
func (b *behavior) publicSettings() gin.H {
	enabled := b.core.PluginEnabled(plugins.KeyGrowth)
	return gin.H{"enabled": enabled, "leaderboard_enabled": enabled && b.settings().LeaderboardEnabled}
}
