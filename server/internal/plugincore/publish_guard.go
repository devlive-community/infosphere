package plugincore

// —— 发布守卫：内容对外可见前（章节发布、已发布章节改动、书籍公开）由插件审查，可拦截待人工审核。——
//
// 核心在各发布路径调用 CheckPublish；未登记守卫时一律放行。被拦截时核心保持内容不可见（章节存为草稿、书籍保持私有），
// 并把拦截说明返回给作者；审核结论由插件经 Core.ApplyModeration 落地（通过 → 应用 Requested；驳回 → 撤回发布）。

// 发布对象类型。
const (
	PublishDocument = "document"
	PublishBook     = "book"
)

// PublishTarget 待发布的内容。
type PublishTarget struct {
	Kind   string
	ID     uint
	BookID uint
	UserID uint // 作者（接收审核结果通知）
	Title  string
	// Fields 待审查的文本字段（字段名 → 内容），如 title、content、description
	Fields map[string]string
	// Requested 被拦截时，审核通过后要应用的变更（章节 {"status":"published"}；书籍 {"is_public":"true","status":"…"}）
	Requested map[string]string
	// ActorID 触发发布的用户（管理员操作时可按设置免审）
	ActorID uint
}

// PublishVerdict 审查结论：Hold 为 true 时拦截，Message 为展示给作者的说明。
type PublishVerdict struct {
	Hold    bool
	Message string
}

// PublishGuard 发布守卫。
type PublishGuard func(core Core, t PublishTarget) PublishVerdict

var publishGuards []PublishGuard

// RegisterPublishGuard 登记发布守卫。
func RegisterPublishGuard(g PublishGuard) { publishGuards = append(publishGuards, g) }

// CheckPublish 依次询问守卫，第一个拦截的结论生效。
func CheckPublish(core Core, t PublishTarget) PublishVerdict {
	for _, g := range publishGuards {
		if v := g(core, t); v.Hold {
			return v
		}
	}
	return PublishVerdict{}
}
