package watermark

import "knowforge/server/internal/plugins"

func init() {
	plugins.Register(plugins.Meta{
		Order:       45,
		Key:         plugins.KeyWatermark,
		Name:        "书籍水印",
		Description: "在阅读页、打印/导出（PDF）上叠加作者设置的文字水印。可在每本书的「水印」设置中独立启用并配置文案。禁用后所有水印一并停用（默认启用，配置保留在书籍字段中）。",
		Kind:        plugins.KindFeature,
		Builtin:     true,
	})
}
