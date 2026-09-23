// Package plugincore 定义插件与核心之间的「服务接口」与「行为注册/钩子」，
// 让插件的 handler 可以搬到自己的子包（internal/plugins/<name>/）而不与 app 包产生循环依赖：
//   - Core：插件从核心获得的能力集合（*app.App 实现之，按需扩展方法）。
//   - Plugin：插件的行为（注册路由/钩子）；子包在 init() 里 RegisterBehavior 自注册，app 只遍历。
//   - 钩子：核心在关键点（如章节发布）触发，插件按需订阅——替代原先核心直接调用某插件方法。
package plugincore

import (
	"context"
	"encoding/json"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"knowforge/server/internal/authz"
	"knowforge/server/internal/jobqueue"
	"knowforge/server/internal/models"
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
	RecordAudit(c *gin.Context, action, resourceType, resourceID, label string, summary map[string]any)
	// RecordExperience 记一条经验流水（成长插件禁用时为空操作）；供成长插件人工调整等复用。
	RecordExperience(userID uint, ruleKey, sourceType, sourceID, dedupeKey string, xp int, reason string)

	// 书籍/用户领域共享工具（核心与多个插件复用）
	IsAdmin(u *models.User) bool
	CanReadBook(u *models.User, b *models.Book) bool
	FindBook(c *gin.Context) (*models.Book, int)
	PreloadBookUser() *gorm.DB
	PreloadBookUserOn(db *gorm.DB) *gorm.DB
	AttachChapterCounts(books []models.Book)
	AttachBookTags(books []models.Book)
	PubliclyReadableBookStatuses() []string

	// 路由中间件（返回 gin.HandlerFunc，供插件注册受保护路由）
	RequireAuth() gin.HandlerFunc
	OptionalAuth() gin.HandlerFunc
	RequirePermission(perm authz.Permission) gin.HandlerFunc
	RequireFeaturePlugin(key string) gin.HandlerFunc
	RequireEmailVerified() gin.HandlerFunc
	RequireAdmin() gin.HandlerFunc
	RequirePermissionMiddleware(perm authz.Permission) gin.HandlerFunc // 与 RequirePermission 同义（命名区分，供插件显式使用）
	RateLimitReaction() gin.HandlerFunc                                 // 互动类写操作的限流中间件（关注/点赞等复用同一策略）

	// 通用工具
	Paginate(c *gin.Context) (page, pageSize int)
	Slugify(s string) string
	RandomSlug(prefix string) string

	// 内容采集插件所需（引擎/worker/端点搬入子包后经此访问核心）
	CanEditBookContent(u *models.User, b *models.Book) bool
	GetSetting(key string) string
	UniqueChildSlug(bookID uint, parentID *uint, base string, excludeID uint) string
	InstalledChromePath() string
	CreateContentImportBook(u *models.User, title, description string, chapters []ImportedChapter) (models.Book, error)
	JobQueue() *jobqueue.Queue
	RequirePageCollect() gin.HandlerFunc
	RequireSiteCollect() gin.HandlerFunc
	// InitialChapterStatus 未显式指定状态时新章节的初始状态（子章节跟随父章节 / 第一级用书籍默认状态 / 否则草稿）。
	InitialChapterStatus(book *models.Book, parentID *uint) string
	// NewDocumentRevision 为章节生成一条版本记录（调用方负责在事务内保存）。
	NewDocumentRevision(doc *models.Document, userID uint, reason string) models.DocumentRevision
	// ExtractDocIcon 从章节正文提取图标声明（与编辑器保存章节时的规则一致）。
	ExtractDocIcon(content string) string
}

// ImportedChapter 导入/采集成书时的中性章节结构（避免暴露 app 内部类型）。
type ImportedChapter struct {
	Title   string
	Content string
}

// PageResult 分页响应（核心与插件共用，保持 JSON 形状一致）。
type PageResult struct {
	Items    any   `json:"items"`
	Total    int64 `json:"total"`
	Page     int   `json:"page"`
	PageSize int   `json:"page_size"`
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

// —— 插件后台任务：任务队列可能在安装向导完成后才创建（且会重建），故插件只登记「处理器工厂」，
// 由核心在每次创建队列时统一注册。——

// JobHandlerFactory 以核心能力构造任务处理器。
type JobHandlerFactory func(core Core) func(ctx context.Context, raw json.RawMessage) error

// PluginJob 已登记的插件后台任务。
type PluginJob struct {
	Type    string
	Factory JobHandlerFactory
}

var pluginJobs []PluginJob

// RegisterJob 供插件子包在 init() 中登记后台任务类型。
func RegisterJob(jobType string, factory JobHandlerFactory) {
	pluginJobs = append(pluginJobs, PluginJob{Type: jobType, Factory: factory})
}

// Jobs 返回全部已登记的插件后台任务（登记顺序）。
func Jobs() []PluginJob { return pluginJobs }

// —— 书籍装饰钩子：核心返回书籍（列表/详情）前调用，插件按需回填非持久化字段（如「采集中」标记）。——

// BooksDecorator 书籍装饰回调；core 为发起调用的核心实例，books 为本次响应中的书籍（可原地修改）。
type BooksDecorator func(core Core, books []*models.Book)

var booksDecorators []BooksDecorator

// OnDecorateBooks 订阅书籍装饰。
func OnDecorateBooks(h BooksDecorator) { booksDecorators = append(booksDecorators, h) }

// DecorateBooks 由核心在返回书籍前调用。
func DecorateBooks(core Core, books []*models.Book) {
	if len(books) == 0 {
		return
	}
	for _, h := range booksDecorators {
		h(core, books)
	}
}
