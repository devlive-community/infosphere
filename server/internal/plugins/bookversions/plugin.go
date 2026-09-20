package bookversions

import "infosphere/server/internal/plugins"

func init() {
	plugins.Register(plugins.Meta{
		Order:       40,
		Key:         plugins.KeyBookVersions,
		Name:        "书籍版本",
		Description: "同一作品的多版本组：阅读/详情页可在不同版本间切换。禁用后版本切换入口与相关接口停用（默认启用，数据保留在书籍字段中）。",
		Kind:        plugins.KindFeature,
		Builtin:     true,
	})
}
