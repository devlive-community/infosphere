package app

// book-versions 插件（书籍版本）自注册。
func init() {
	registerPlugin(pluginInfo{
		Order:       40,
		Key:         pluginBookVersions,
		Name:        "书籍版本",
		Description: "同一作品的多版本组：阅读/详情页可在不同版本间切换。禁用后版本切换入口与相关接口停用（默认启用，数据保留在书籍字段中）。",
		Kind:        pluginKindFeature,
		Builtin:     true,
	})
}
