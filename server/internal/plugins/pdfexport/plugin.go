// Package pdfexport 无头浏览器（Chromium）运行时插件：书籍 PDF 导出端点（渲染内嵌 Web 的打印页并输出 PDF）。
// 运行时的下载/安装由核心插件管理负责（内容采集的浏览器渲染同样依赖它）。
package pdfexport

import (
	"github.com/gin-gonic/gin"

	"knowforge/server/internal/plugincore"
	"knowforge/server/internal/plugins"
)

type behavior struct{ core plugincore.Core }

func init() {
	plugincore.RegisterBehavior(&behavior{})
	plugins.Register(plugins.Meta{
		Order:       10,
		Key:         plugins.KeyPDFExport,
		Name:        "无头浏览器 (Chromium)",
		Description: "安装官方 chrome-headless-shell，用于书籍 PDF 导出与网页浏览器渲染采集（运行 JavaScript）。约 130–170MB，下载到数据目录。",
		SizeHint:    "~150MB",
		Kind:        plugins.KindRuntime,
		Builtin:     false, // 需从外部下载运行时，归为「外部插件」
	})
}

func (px *behavior) Key() string { return plugins.KeyPDFExport }

// RegisterRoutes 挂载 PDF 导出（公开路由，可匿名导出公开书籍；未安装运行时由处理器返回明确提示）。
func (px *behavior) RegisterRoutes(api *gin.RouterGroup, core plugincore.Core) {
	px.core = core
	api.GET("/books/:id/export/pdf", core.OptionalAuth(), px.ExportBookPDF)
}
