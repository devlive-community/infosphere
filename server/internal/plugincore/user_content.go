package plugincore

import (
	"sort"

	"knowforge/server/internal/models"
)

// —— 用户内容：插件登记自己的用户生成内容类型（如问答的提问、回答），纳入发布审核与内容举报。——
//
// 核心与审核插件都不认识具体插件：
//   - 发布前插件调用 CheckPublish（Kind 为登记的类型）；审核结论经 Core.ApplyModeration 分发给登记者的 SetVisible；
//   - 内容举报接受登记的类型：举报时以 Resolve 校验举报人可见并取标签，下架时调用 SetVisible(false)。

// ContentRef 用户内容的展示信息。
type ContentRef struct {
	Label   string // 列表中展示的摘要（标题或截断的正文）
	Link    string // 前台查看链接
	OwnerID uint
	BookID  uint
}

// UserContent 一种用户内容类型。
type UserContent struct {
	Kind string // 唯一，如 qa_question
	// Resolve 读取内容：viewer 为 nil 时为系统/管理视角（不做可见性校验）；否则仅在 viewer 可见时返回 found=true。
	Resolve func(core Core, viewer *models.User, id uint) (ContentRef, bool)
	// SetVisible 审核通过/恢复（true）或驳回/下架（false）；须幂等。
	SetVisible func(core Core, id uint, visible bool) error
}

var userContents = map[string]UserContent{}

// RegisterUserContent 登记用户内容类型（Kind 唯一）。
func RegisterUserContent(c UserContent) { userContents[c.Kind] = c }

// UserContentFor 按类型查登记。
func UserContentFor(kind string) (UserContent, bool) {
	c, ok := userContents[kind]
	return c, ok
}

// UserContentKinds 已登记的用户内容类型（排序）。
func UserContentKinds() []string {
	out := make([]string, 0, len(userContents))
	for k := range userContents {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
