package app

import (
	"infosphere/server/internal/authz"
	"infosphere/server/internal/models"
)

// tags 插件（标签系统）自注册。
func init() {
	registerPlugin(pluginInfo{
		Order:       80,
		Key:         pluginTags,
		Name:        "标签系统",
		Description: "书籍标签浏览、按标签检索与后台标签管理（图标）。禁用后标签页面与相关接口一并停用（默认启用）。首次启用建表、注册权限，卸载可清除数据。",
		Kind:        pluginKindFeature,
		Builtin:     true,
		Models:      []any{&models.Tag{}, &models.BookTag{}},
		Tables:      []string{"book_tags", "tags"},
		AdminPerms:  []authz.Permission{authz.TagDelete, authz.TagManage},
		UserPerms:   []authz.Permission{authz.TagRead, authz.TagCreate},
	})
}
