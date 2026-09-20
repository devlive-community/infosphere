package booktranslations

import "infosphere/server/internal/plugins"

func init() {
	plugins.Register(plugins.Meta{
		Order:       30,
		Key:         plugins.KeyBookTranslations,
		Name:        "书籍多语言",
		Description: "同一作品的多语言互译组：阅读/详情页可在不同语言版本间切换。禁用后语言切换入口与相关接口停用（默认启用，数据保留在书籍字段中）。",
		Kind:        plugins.KindFeature,
		Builtin:     true,
	})
}
