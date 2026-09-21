package pdfexport

import "knowforge/server/internal/plugins"

func init() {
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
