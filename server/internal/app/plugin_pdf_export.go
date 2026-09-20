package app

// pdf-export 插件（无头浏览器 / Chromium 运行时）自注册。
func init() {
	registerPlugin(pluginInfo{
		Order:       10,
		Key:         pluginPDFExport,
		Name:        "无头浏览器 (Chromium)",
		Description: "安装官方 chrome-headless-shell，用于书籍 PDF 导出与网页浏览器渲染采集（运行 JavaScript）。约 130–170MB，下载到数据目录。",
		SizeHint:    "~150MB",
		Kind:        pluginKindRuntime,
		Builtin:     false, // 需从外部下载运行时，归为「外部插件」
	})
}
