package app

import (
	"fmt"
	"net/http"
	"strconv"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// FollowBook POST /books/:id/follow 关注书籍（幂等）
func (a *App) FollowBook(c *gin.Context) {
	u := currentUser(c)
	bookID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	var book models.Book
	if err := a.DB.First(&book, bookID).Error; err != nil || !a.canReadBook(u, &book) {
		fail(c, http.StatusNotFound, "书籍不存在")
		return
	}
	f := models.BookFollow{UserID: u.ID, BookID: book.ID}
	a.DB.Where("user_id = ? AND book_id = ?", u.ID, book.ID).FirstOrCreate(&f)
	ok(c, gin.H{"following": true, "count": a.bookFollowerCount(book.ID)})
}

// UnfollowBook DELETE /books/:id/follow 取消关注
func (a *App) UnfollowBook(c *gin.Context) {
	u := currentUser(c)
	bookID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	a.DB.Where("user_id = ? AND book_id = ?", u.ID, bookID).Delete(&models.BookFollow{})
	ok(c, gin.H{"following": false, "count": a.bookFollowerCount(uint(bookID))})
}

// MyBookFollow GET /books/:id/follow/me 当前用户是否关注 + 关注数
func (a *App) MyBookFollow(c *gin.Context) {
	u := currentUser(c)
	bookID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	var following int64
	a.DB.Model(&models.BookFollow{}).Where("user_id = ? AND book_id = ?", u.ID, bookID).Count(&following)
	ok(c, gin.H{"following": following > 0, "count": a.bookFollowerCount(uint(bookID))})
}

func (a *App) bookFollowerCount(bookID uint) int64 {
	var count int64
	a.DB.Model(&models.BookFollow{}).Where("book_id = ?", bookID).Count(&count)
	return count
}

// MyFollows GET /users/me/follows 当前用户关注的书籍（分页），供「我的关注」列表。
func (a *App) MyFollows(c *gin.Context) {
	u := currentUser(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	pageSize := 12
	if p := atoiDefault(c.Query("page_size"), 12); p > 0 && p <= 50 {
		pageSize = p
	}

	q := a.DB.Model(&models.BookFollow{}).
		Joins("JOIN books b ON b.id = book_follows.book_id").
		Where("book_follows.user_id = ?", u.ID)
	if !IsAdmin(u) {
		q = q.Where("(b.is_public = ? AND b.status IN ?) OR b.user_id = ?", true, publiclyReadableBookStatuses, u.ID)
	}
	var total int64
	q.Session(&gorm.Session{}).Count(&total)
	var follows []models.BookFollow
	if err := q.Select("book_follows.*").Order("book_follows.created_at DESC").
		Limit(pageSize).Offset((page - 1) * pageSize).Find(&follows).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询失败")
		return
	}

	bookIDs := make([]uint, 0, len(follows))
	for _, f := range follows {
		bookIDs = append(bookIDs, f.BookID)
	}
	list := []models.Book{}
	if len(bookIDs) > 0 {
		preloadBookUser(a.DB).Where("id IN ?", bookIDs).Find(&list)
		a.attachChapterCounts(list)
		a.attachBookTags(list)
	}
	byID := make(map[uint]models.Book, len(list))
	for _, b := range list {
		byID[b.ID] = b
	}
	items := make([]gin.H, 0, len(follows))
	for _, f := range follows {
		if b, ok2 := byID[f.BookID]; ok2 {
			items = append(items, gin.H{"book": b, "followed_at": f.CreatedAt})
		}
	}
	ok(c, gin.H{"items": items, "total": total, "page": page, "page_size": pageSize})
}

// notifyBookFollowers 向关注该书的用户（作者本人除外）发送更新通知，尊重每人的 book_update 偏好。
func (a *App) notifyBookFollowers(book *models.Book, title, link string) {
	if book == nil || !a.pluginEnabled(pluginBookFollow) {
		return
	}
	var follows []models.BookFollow
	a.DB.Where("book_id = ?", book.ID).Find(&follows)
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
	a.DB.Where("user_id IN ?", userIDs).Find(&rows)
	for _, p := range rows {
		if !p.BookUpdate {
			off[p.UserID] = true
		}
	}
	for _, uid := range userIDs {
		if off[uid] {
			continue
		}
		a.Notify(uid, "book_update", title, map[string]any{"link": link})
	}
}

// notifyChapterPublished 章节发布时通知关注者。link 指向该章节阅读页。
func (a *App) notifyChapterPublished(book *models.Book, doc *models.Document) {
	if book == nil || doc == nil {
		return
	}
	title := fmt.Sprintf("《%s》更新了新章节：%s", book.Title, doc.Title)
	link := fmt.Sprintf("/book/reader/%s/%s", book.Slug, doc.Slug)
	a.notifyBookFollowers(book, title, link)
}
