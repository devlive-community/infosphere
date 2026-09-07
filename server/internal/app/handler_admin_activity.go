package app

import (
	"net/http"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

// 最近活动条目数（用户与书籍各自取前 N 条）
const adminActivityLimit = 5

// AdminActivity GET /admin/activity 控制台首页时间线：最近注册用户与最近建书（仅管理员）
// 与公开 /explore/latest 不同，此处不限书籍可见性（含草稿/私有），仅供管理员运营视角使用。
func (a *App) AdminActivity(c *gin.Context) {
	var recentUsers []models.User
	if err := a.DB.Select("id, username, email, role, is_active, created_at").
		Order("created_at DESC").Limit(adminActivityLimit).Find(&recentUsers).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询失败")
		return
	}

	var recentBooks []models.Book
	if err := a.DB.Preload("User").
		Select("id, title, slug, user_id, status, is_public, created_at").
		Order("created_at DESC").Limit(adminActivityLimit).Find(&recentBooks).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询失败")
		return
	}

	ok(c, gin.H{
		"recent_users": recentUsers,
		"recent_books": recentBooks,
	})
}
