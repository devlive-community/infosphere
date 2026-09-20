package app

// 触发各内置插件子包的 init() 自注册（plugins.Register）。app 只需 blank import，
// 之后通过 plugins.All() 读取清单；新增插件时在此追加一行 blank import 即可被发现。
import (
	_ "infosphere/server/internal/plugins/achievements"
	_ "infosphere/server/internal/plugins/bookfollow"
	_ "infosphere/server/internal/plugins/booktranslations"
	_ "infosphere/server/internal/plugins/bookversions"
	_ "infosphere/server/internal/plugins/contentcollect"
	_ "infosphere/server/internal/plugins/growth"
	_ "infosphere/server/internal/plugins/pdfexport"
	_ "infosphere/server/internal/plugins/tags"
	_ "infosphere/server/internal/plugins/watermark"
)
