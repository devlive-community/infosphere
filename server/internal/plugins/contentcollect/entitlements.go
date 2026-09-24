package contentcollect

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"knowforge/server/internal/models"
	"knowforge/server/internal/plugincore"
	"knowforge/server/internal/plugins"
)

// 内容采集的权益：单页采集、整站采集（开关）与整站采集页数上限。
// 基础值即原有的全站设置（采集设置中的两个子开关与页数上限），默认行为不变；
// 等级/会员可为特定用户放开（如「Lv.5 起可整站采集」= 基础关 + 等级开）。插件禁用时恒为不可用。

const (
	entCollectPage    = "collect.page"
	entCollectSite    = "collect.site"
	entCollectSiteMax = "collect.site_max_pages"
	cfgCollectPage    = "collect_page_enabled"
	cfgCollectSite    = "collect_site_enabled"
	cfgCollectSiteMax = "collect_site_page_limit"
	defaultSitePages  = 200
	maxSitePagesLimit = 5000
)

func init() {
	available := func(core plugincore.Core) bool { return core.PluginEnabled(plugins.KeyContentCollect) }
	// flag 开关型权益：基础值读写对应的采集子开关设置（cfgKey），未设置视为开启（与原行为一致）
	flag := func(entKey, cfgKey, desc string, order int) plugincore.EntitlementDef {
		return plugincore.EntitlementDef{
			Key: entKey, Kind: plugincore.EntitlementFlag,
			Min: 0, Max: 1, Order: order, Available: available,
			Base: func(core plugincore.Core) int64 {
				if core.GetSetting(cfgKey) == "false" {
					return 0
				}
				return 1
			},
			SetBase: func(core plugincore.Core, v int64) error {
				return core.SetSetting(cfgKey, strconv.FormatBool(v == 1), desc)
			},
		}
	}
	// 公开站点配置：单页/整站采集的全站开关（含插件启用判定），游客与旧客户端据此联动采集入口；
	// 登录用户以 /auth/me 下发的权益为准（等级/会员可放开）。
	plugincore.RegisterPublicSiteConfig(func(core plugincore.Core) map[string]any {
		on := available(core)
		return map[string]any{
			cfgCollectPage: on && core.GetSetting(cfgCollectPage) != "false",
			cfgCollectSite: on && core.GetSetting(cfgCollectSite) != "false",
		}
	})
	plugincore.RegisterEntitlement(flag(entCollectPage, cfgCollectPage, "内容采集：单页网页采集开关", 40))
	plugincore.RegisterEntitlement(flag(entCollectSite, cfgCollectSite, "内容采集：整站采集开关", 50))
	plugincore.RegisterEntitlement(plugincore.EntitlementDef{
		Key: entCollectSiteMax, Kind: plugincore.EntitlementLimit, Unit: "pages", Min: 1, Max: maxSitePagesLimit, Order: 60, Available: available,
		Base: func(core plugincore.Core) int64 {
			if n, err := strconv.Atoi(core.GetSetting(cfgCollectSiteMax)); err == nil && n > 0 && n <= maxSitePagesLimit {
				return int64(n)
			}
			return defaultSitePages
		},
		SetBase: func(core plugincore.Core, v int64) error {
			return core.SetSetting(cfgCollectSiteMax, strconv.FormatInt(v, 10), "内容采集：整站采集页数上限")
		},
	})
}

// requireCollect 按当前用户的采集权益放行（插件禁用时 404；无权益时 403）。
func (cc *behavior) requireCollect(key string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !cc.core.PluginEnabled(plugins.KeyContentCollect) {
			cc.core.Fail(c, http.StatusNotFound, "内容采集未启用")
			c.Abort()
			return
		}
		if plugincore.EntitlementValue(cc.core, cc.core.CurrentUser(c), key) <= 0 {
			msg := "你的账号暂无网页采集权限"
			if key == entCollectSite {
				msg = "你的账号暂无整站采集权限"
			}
			cc.core.Fail(c, http.StatusForbidden, msg)
			c.Abort()
			return
		}
		c.Next()
	}
}

// siteCrawlPageLimit 当前用户的整站采集页数上限（权益，基础值为采集设置中的页数上限）。
func (cc *behavior) siteCrawlPageLimit(u *models.User) int {
	if v := plugincore.EntitlementValue(cc.core, u, entCollectSiteMax); v > 0 {
		return int(v)
	}
	return defaultSitePages
}
