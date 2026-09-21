package bookfollow

import (
	"fmt"
	"net/http"
	"strconv"
	"sync"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"knowforge/server/internal/authz"
	"knowforge/server/internal/models"
	"knowforge/server/internal/plugincore"
	"knowforge/server/internal/plugins"
)

// behavior 承载「书籍关注」插件的路由与 handler，通过 plugincore.Core 访问核心能力。
type behavior struct {
	core     plugincore.Core
	hookOnce sync.Once // 章节发布钩子只注册一次（RegisterRoutes 可能被多次调用/重建路由）
}

func init() { plugincore.RegisterBehavior(&behavior{}) }

func (b *behavior) Key() string { return plugins.KeyBookFollow }

// RegisterRoutes 注册关注相关路由（与原 router.go 中的中间件链保持一致），并订阅章节发布钩子。
func (b *behavior) RegisterRoutes(api *gin.RouterGroup, core plugincore.Core) {
	b.core = core
	guard := core.RequireFeaturePlugin(plugins.KeyBookFollow)
	api.POST("/books/:id/follow", core.RequireAuth(), guard, core.RequirePermission(authz.FollowCreate), core.RateLimitReaction(), b.FollowBook)
	api.DELETE("/books/:id/follow", core.RequireAuth(), guard, core.RequirePermission(authz.FollowDelete), core.RateLimitReaction(), b.UnfollowBook)
	api.GET("/books/:id/follow/me", core.RequireAuth(), guard, core.RequirePermission(authz.FollowRead), b.MyBookFollow)
	api.GET("/users/me/follows", core.RequireAuth(), guard, core.RequirePermission(authz.FollowRead), b.MyFollows)
	// 章节发布 → 通知关注者（订阅核心钩子，替代核心直接调用插件方法）；只注册一次，避免重复通知。
	b.hookOnce.Do(func() {
		plugincore.OnChapterPublished(func(book *models.Book, doc *models.Document) { b.notifyChapterPublished(book, doc) })
	})
}

// FollowBook POST /books/:id/follow 关注书籍（幂等）
func (b *behavior) FollowBook(c *gin.Context) {
	core := b.core
	u := core.CurrentUser(c)
	bookID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		core.Fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	var book models.Book
	if err := core.Gorm().First(&book, bookID).Error; err != nil || !core.CanReadBook(u, &book) {
		core.Fail(c, http.StatusNotFound, "书籍不存在")
		return
	}
	f := BookFollow{UserID: u.ID, BookID: book.ID}
	core.Gorm().Where("user_id = ? AND book_id = ?", u.ID, book.ID).FirstOrCreate(&f)
	core.OK(c, gin.H{"following": true, "count": b.bookFollowerCount(book.ID)})
}

// UnfollowBook DELETE /books/:id/follow 取消关注
func (b *behavior) UnfollowBook(c *gin.Context) {
	core := b.core
	u := core.CurrentUser(c)
	bookID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		core.Fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	core.Gorm().Where("user_id = ? AND book_id = ?", u.ID, bookID).Delete(&BookFollow{})
	core.OK(c, gin.H{"following": false, "count": b.bookFollowerCount(uint(bookID))})
}

// MyBookFollow GET /books/:id/follow/me 当前用户是否关注 + 关注数
func (b *behavior) MyBookFollow(c *gin.Context) {
	core := b.core
	u := core.CurrentUser(c)
	bookID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		core.Fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	var following int64
	core.Gorm().Model(&BookFollow{}).Where("user_id = ? AND book_id = ?", u.ID, bookID).Count(&following)
	core.OK(c, gin.H{"following": following > 0, "count": b.bookFollowerCount(uint(bookID))})
}

func (b *behavior) bookFollowerCount(bookID uint) int64 {
	var count int64
	b.core.Gorm().Model(&BookFollow{}).Where("book_id = ?", bookID).Count(&count)
	return count
}

// MyFollows GET /users/me/follows 当前用户关注的书籍（分页），供「我的关注」列表。
func (b *behavior) MyFollows(c *gin.Context) {
	core := b.core
	u := core.CurrentUser(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	pageSize := 12
	if p := core.AtoiDefault(c.Query("page_size"), 12); p > 0 && p <= 50 {
		pageSize = p
	}

	q := core.Gorm().Model(&BookFollow{}).
		Joins("JOIN books b ON b.id = book_follows.book_id").
		Where("book_follows.user_id = ?", u.ID)
	if !core.IsAdmin(u) {
		q = q.Where("(b.is_public = ? AND b.status IN ?) OR b.user_id = ?", true, core.PubliclyReadableBookStatuses(), u.ID)
	}
	var total int64
	q.Session(&gorm.Session{}).Count(&total)
	var follows []BookFollow
	if err := q.Select("book_follows.*").Order("book_follows.created_at DESC").
		Limit(pageSize).Offset((page - 1) * pageSize).Find(&follows).Error; err != nil {
		core.Fail(c, http.StatusInternalServerError, "查询失败")
		return
	}

	bookIDs := make([]uint, 0, len(follows))
	for _, f := range follows {
		bookIDs = append(bookIDs, f.BookID)
	}
	list := []models.Book{}
	if len(bookIDs) > 0 {
		core.PreloadBookUser().Where("id IN ?", bookIDs).Find(&list)
		core.AttachChapterCounts(list)
		core.AttachBookTags(list)
	}
	byID := make(map[uint]models.Book, len(list))
	for _, bk := range list {
		byID[bk.ID] = bk
	}
	items := make([]gin.H, 0, len(follows))
	for _, f := range follows {
		if bk, ok2 := byID[f.BookID]; ok2 {
			items = append(items, gin.H{"book": bk, "followed_at": f.CreatedAt})
		}
	}
	core.OK(c, gin.H{"items": items, "total": total, "page": page, "page_size": pageSize})
}

// notifyBookFollowers 向关注该书的用户（作者本人除外）发送更新通知，尊重每人的 book_update 偏好。
func (b *behavior) notifyBookFollowers(book *models.Book, title, link string) {
	core := b.core
	if book == nil || !core.PluginEnabled(plugins.KeyBookFollow) {
		return
	}
	var follows []BookFollow
	core.Gorm().Where("book_id = ?", book.ID).Find(&follows)
	userIDs := make([]uint, 0, len(follows))
	for _, f := range follows {
		if f.UserID != book.UserID {
			userIDs = append(userIDs, f.UserID)
		}
	}
	if len(userIDs) == 0 {
		return
	}
	// 批量取偏好：有记录且 book_update=false 才跳过（无记录=默认开启）
	off := map[uint]bool{}
	var rows []models.UserNotificationPref
	core.Gorm().Where("user_id IN ?", userIDs).Find(&rows)
	for _, p := range rows {
		if !p.BookUpdate {
			off[p.UserID] = true
		}
	}
	for _, uid := range userIDs {
		if off[uid] {
			continue
		}
		core.Notify(uid, "book_update", title, map[string]any{"link": link})
	}
}

// notifyChapterPublished 章节发布时通知关注者。link 指向该章节阅读页。
func (b *behavior) notifyChapterPublished(book *models.Book, doc *models.Document) {
	if book == nil || doc == nil {
		return
	}
	title := fmt.Sprintf("《%s》更新了新章节：%s", book.Title, doc.Title)
	link := fmt.Sprintf("/book/reader/%s/%s", book.Slug, doc.Slug)
	b.notifyBookFollowers(book, title, link)
}
