package app

import (
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"knowforge/server/internal/authz"
	"knowforge/server/internal/jobqueue"
	"knowforge/server/internal/models"
	"knowforge/server/internal/plugincore"
)

// 本文件把 *App 适配为 plugincore.Core：插件子包通过该接口访问核心能力，避免与 app 包循环依赖。
// 这些方法都是对既有 app 内部函数/字段的薄封装，行为与原来完全一致。
var _ plugincore.Core = (*App)(nil)

func (a *App) Gorm() *gorm.DB                                  { return a.DB }
func (a *App) CurrentUser(c *gin.Context) *models.User         { return currentUser(c) }
func (a *App) OK(c *gin.Context, data any)                     { ok(c, data) }
func (a *App) Fail(c *gin.Context, status int, message string) { fail(c, status, message) }
func (a *App) AtoiDefault(s string, def int) int               { return atoiDefault(s, def) }
func (a *App) PluginEnabled(key string) bool                   { return a.pluginEnabled(key) }
func (a *App) IsAdmin(u *models.User) bool                     { return IsAdmin(u) }
func (a *App) CanReadBook(u *models.User, b *models.Book) bool { return a.canReadBook(u, b) }
func (a *App) FindBook(c *gin.Context) (*models.Book, int)     { return a.findBook(c) }
func (a *App) PreloadBookUser() *gorm.DB                       { return preloadBookUser(a.DB) }
func (a *App) PreloadBookUserOn(db *gorm.DB) *gorm.DB          { return preloadBookUser(db) }
func (a *App) AttachChapterCounts(books []models.Book)         { a.attachChapterCounts(books) }
func (a *App) AttachBookTags(books []models.Book)              { a.attachBookTags(books) }
func (a *App) PubliclyReadableBookStatuses() []string          { return publiclyReadableBookStatuses }
func (a *App) RateLimitReaction() gin.HandlerFunc              { return a.RateLimit(reactionRateLimit) }

func (a *App) RequirePermissionMiddleware(perm authz.Permission) gin.HandlerFunc {
	return a.RequirePermission(perm)
}
func (a *App) RecordAudit(c *gin.Context, action, resourceType, resourceID, label string, summary map[string]any) {
	a.recordAudit(c, action, resourceType, resourceID, label, summary)
}
func (a *App) Paginate(c *gin.Context) (int, int) { return paginate(c) }
func (a *App) Slugify(s string) string            { return slugify(s) }
func (a *App) RandomSlug(prefix string) string    { return randomSlug(prefix) }

// —— 内容采集插件所需 ——
func (a *App) CanEditBookContent(u *models.User, b *models.Book) bool { return a.canEditBookContent(u, b) }
func (a *App) GetSetting(key string) string                          { return a.getSetting(key) }
func (a *App) InstalledChromePath() string                           { return a.installedChromePath() }
func (a *App) JobQueue() *jobqueue.Queue                             { return a.jobQueue() }
func (a *App) UniqueChildSlug(bookID uint, parentID *uint, base string, excludeID uint) string {
	return a.uniqueChildSlug(bookID, parentID, base, excludeID)
}
func (a *App) CreateContentImportBook(u *models.User, title, description string, chapters []plugincore.ImportedChapter) (models.Book, error) {
	local := make([]importedChapter, len(chapters))
	for i, ch := range chapters {
		local[i] = importedChapter{Title: ch.Title, Content: ch.Content}
	}
	return a.createContentImportBook(u, title, description, local)
}
func (a *App) InitialChapterStatus(book *models.Book, parentID *uint) string {
	return a.initialChapterStatus(book, parentID)
}
func (a *App) NewDocumentRevision(doc *models.Document, userID uint, reason string) models.DocumentRevision {
	return newDocumentRevision(doc, userID, reason)
}
func (a *App) ExtractDocIcon(content string) string { return extractDocIcon(content) }
