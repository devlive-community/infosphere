package app

// watermark 插件（书籍水印）自注册。纯功能开关：配置存书籍字段，无独占表/权限。
// 禁用后阅读页/打印页/导出均不渲染水印，书籍设置的「水印」tab 也隐藏（默认启用）。
func init() {
	registerPlugin(pluginInfo{
		Order:       45,
		Key:         pluginWatermark,
		Name:        "书籍水印",
		Description: "在阅读页、打印/导出（PDF）上叠加作者设置的文字水印。可在每本书的「水印」设置中独立启用并配置文案。禁用后所有水印一并停用（默认启用，配置保留在书籍字段中）。",
		Kind:        pluginKindFeature,
		Builtin:     true,
	})
}
