package app

import (
	"infosphere/server/internal/authz"
	"infosphere/server/internal/models"
)

// content-collect 插件（内容采集：网页/整站）自注册。
func init() {
	registerPlugin(pluginInfo{
		Order:       70,
		Key:         pluginContentCollect,
		Name:        "内容采集",
		Description: "网页采集与整站采集：把外部网页/文档站点抓取为书籍章节。含编辑器「采集网页」、网页导入成书、整站递归采集（目录预览 + 内容区确认 + 后台采集 + 失败重试 + 采集历史）。禁用后所有采集入口与接口一并停用（默认启用）。首次启用建表、注册权限，卸载可清除采集记录。",
		Kind:        pluginKindFeature,
		Builtin:     true,
		Models:      []any{&models.CrawlJob{}, &models.CrawlPage{}},
		Tables:      []string{"crawl_pages", "crawl_jobs"},
		AdminPerms:  []authz.Permission{authz.CollectManage},
		UserPerms:   []authz.Permission{authz.CollectRead, authz.CollectCreate, authz.CollectManage},
	})
}
