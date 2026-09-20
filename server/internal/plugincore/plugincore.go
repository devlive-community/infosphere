// Package plugincore 定义插件与核心之间的「服务接口」与「行为注册/钩子」，
// 让插件的 handler 可以搬到自己的子包（internal/plugins/<name>/）而不与 app 包产生循环依赖：
//   - Core：插件从核心获得的能力集合（*app.App 实现之，按需扩展方法）。
//   - Plugin：插件的行为（注册路由/钩子）；子包在 init() 里 RegisterBehavior 自注册，app 只遍历。
//   - 钩子：核心在关键点（如章节发布）触发，插件按需订阅——替代原先核心直接调用某插件方法。
package plugincore

import (
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"infosphere/server/internal/authz"
	"infosphere/server/internal/models"
)

// Core 插件从核心获得的能力（*app.App 实现）。按迁移需要逐步扩展，保持与原 app 内部函数一一对应。
type Core interface {
	Gorm() *gorm.DB // GORM 句柄（避免与 *App.DB 字段同名，命名为 Gorm）
	CurrentUser(c *gin.Context) *models.User
	OK(c *gin.Context, data any)
	Fail(c *gin.Context, status int, message string)
	AtoiDefault(s string, def int) int
	Notify(userID uint, ntype, title string, payload map[string]any)
	PluginEnabled(key string) bool

	// 书籍/用户领域共享工具（核心与多个插件复用）
	IsAdmin(u *models.User) bool
	CanReadBook(u *models.User, b *models.Book) bool
	PreloadBookUser() *gorm.DB
	AttachChapterCounts(books []models.Book)
	AttachBookTags(books []models.Book)
	PubliclyReadableBookStatuses() []string

	// 路由中间件（返回 gin.HandlerFunc，供插件注册受保护路由）
	RequireAuth() gin.HandlerFunc
	RequirePermission(perm authz.Permission) gin.HandlerFunc
	RequireFeaturePlugin(key string) gin.HandlerFunc
	RequireEmailVerified() gin.HandlerFunc
	RateLimitReaction() gin.HandlerFunc // 互动类写操作的限流中间件（关注/点赞等复用同一策略）
}

// Plugin 插件的行为：注册路由与钩子。核心在构建路由时调用 RegisterRoutes。
type Plugin interface {
	Key() string
	RegisterRoutes(api *gin.RouterGroup, core Core)
}

var behaviors []Plugin

// RegisterBehavior 供各插件子包在 init() 中自注册行为。
func RegisterBehavior(p Plugin) { behaviors = append(behaviors, p) }

// Behaviors 返回全部已注册的插件行为（注册顺序）。
func Behaviors() []Plugin { return behaviors }

// —— 钩子：核心在关键点触发，插件订阅（解耦核心对具体插件的直接调用）——

// ChapterPublishedHook 章节发布后的回调。
type ChapterPublishedHook func(book *models.Book, doc *models.Document)

var chapterPublishedHooks []ChapterPublishedHook

// OnChapterPublished 订阅章节发布事件。
func OnChapterPublished(h ChapterPublishedHook) { chapterPublishedHooks = append(chapterPublishedHooks, h) }

// FireChapterPublished 由核心在章节发布成功后调用，依次通知订阅者。
func FireChapterPublished(book *models.Book, doc *models.Document) {
	for _, h := range chapterPublishedHooks {
		h(book, doc)
	}
}
