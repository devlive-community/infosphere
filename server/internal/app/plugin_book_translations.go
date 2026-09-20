package app

// book-translations 插件（书籍多语言）自注册。
func init() {
	registerPlugin(pluginInfo{
		Order:       30,
		Key:         pluginBookTranslations,
		Name:        "书籍多语言",
		Description: "同一作品的多语言互译组：阅读/详情页可在不同语言版本间切换。禁用后语言切换入口与相关接口停用（默认启用，数据保留在书籍字段中）。",
		Kind:        pluginKindFeature,
		Builtin:     true,
	})
}
