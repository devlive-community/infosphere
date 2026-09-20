package bookfollow

import (
	"infosphere/server/internal/authz"
	"infosphere/server/internal/models"
	"infosphere/server/internal/plugins"
)

func init() {
	plugins.Register(plugins.Meta{
		Order:       50,
		Key:         plugins.KeyBookFollow,
		Name:        "书籍关注",
		Description: "用户可关注书籍，作品更新（新章节/状态）时收到通知；用户可在通知偏好中开关。禁用后关注入口、我的关注、相关接口与更新通知一并停用（默认启用）。首次启用建表、注册权限，卸载可清除数据。",
		Kind:        plugins.KindFeature,
		Builtin:     true,
		Models:      []any{&models.BookFollow{}},
		Tables:      []string{"book_follows"},
		UserPerms:   []authz.Permission{authz.FollowRead, authz.FollowCreate, authz.FollowDelete},
	})
}
