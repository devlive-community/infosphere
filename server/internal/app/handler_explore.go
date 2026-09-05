package app

import (
	"net/http"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func (a *App) publicPublishedBooks() *gorm.DB {
	return a.DB.Where("is_public = ? AND status = ?", true, "published")
}

// ExploreHot GET /explore/hot 浏览量最高的 6 本公开书籍
func (a *App) ExploreHot(c *gin.Context) {
	books := []models.Book{}
	if err := preloadBookUser(a.publicPublishedBooks()).
		Order("view_count DESC").Limit(6).Find(&books).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询失败")
		return
	}
	ok(c, books)
}

// ExploreLatest GET /explore/latest 最新发布的 6 本公开书籍
func (a *App) ExploreLatest(c *gin.Context) {
	books := []models.Book{}
	if err := preloadBookUser(a.publicPublishedBooks()).
		Order("created_at DESC").Limit(6).Find(&books).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询失败")
		return
	}
	ok(c, books)
}

// SiteStats GET /stats 站点统计
func (a *App) SiteStats(c *gin.Context) {
	var userCount, bookCount, docCount int64
	var views int64
	a.DB.Model(&models.User{}).Count(&userCount)
	a.DB.Model(&models.Book{}).Count(&bookCount)
	a.DB.Model(&models.Document{}).Count(&docCount)
	a.DB.Model(&models.Book{}).Select("COALESCE(SUM(view_count), 0)").Scan(&views)
	ok(c, gin.H{
		"user_count":     userCount,
		"book_count":     bookCount,
		"document_count": docCount,
		"total_views":    views,
	})
}

// GetSiteConfig GET /site 公开站点配置
func (a *App) GetSiteConfig(c *gin.Context) {
	var rows []models.SiteConfig
	a.DB.Where("config_key IN ?", []string{"site_name", "site_description", "version", "installation_date"}).Find(&rows)
	cfg := gin.H{}
	for _, r := range rows {
		cfg[r.ConfigKey] = r.ConfigValue
	}
	ok(c, cfg)
}

type siteConfigUpdate struct {
	SiteName        *string `json:"site_name"`
	SiteDescription *string `json:"site_description"`
}

// UpdateSiteConfig PUT /site 管理员更新站点配置
func (a *App) UpdateSiteConfig(c *gin.Context) {
	var req siteConfigUpdate
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	updates := map[string]string{}
	if req.SiteName != nil {
		updates["site_name"] = *req.SiteName
	}
	if req.SiteDescription != nil {
		updates["site_description"] = *req.SiteDescription
	}
	for key, value := range updates {
		var cfg models.SiteConfig
		if err := a.DB.Where("config_key = ?", key).First(&cfg).Error; err != nil {
			cfg = models.SiteConfig{ConfigKey: key}
		}
		cfg.ConfigValue = value
		if err := a.DB.Save(&cfg).Error; err != nil {
			fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
			return
		}
	}
	ok(c, gin.H{"message": "已保存"})
}

// GetUserProfile GET /users/:username
func (a *App) GetUserProfile(c *gin.Context) {
	var u models.User
	if err := a.DB.Select("id", "username", "avatar", "bio", "github_url", "role", "created_at").
		Where("username = ?", c.Param("username")).First(&u).Error; err != nil {
		fail(c, http.StatusNotFound, "用户不存在")
		return
	}
	var bookCount int64
	a.DB.Model(&models.Book{}).Where("user_id = ? AND is_public = ? AND status = ?", u.ID, true, "published").Count(&bookCount)
	ok(c, gin.H{
		"id": u.ID, "username": u.Username, "avatar": u.Avatar, "bio": u.Bio,
		"github_url": u.GithubURL, "role": u.Role, "created_at": u.CreatedAt,
		"public_book_count": bookCount,
	})
}

// GetUserBooks GET /users/:username/books 该用户的公开书籍
func (a *App) GetUserBooks(c *gin.Context) {
	page, pageSize := paginate(c)
	var u models.User
	if err := a.DB.Select("id").Where("username = ?", c.Param("username")).First(&u).Error; err != nil {
		fail(c, http.StatusNotFound, "用户不存在")
		return
	}
	query := a.DB.Model(&models.Book{}).Where("user_id = ? AND is_public = ? AND status = ?", u.ID, true, "published")
	var total int64
	query.Count(&total)
	books := []models.Book{}
	if err := preloadBookUser(query).Order("created_at DESC").
		Limit(pageSize).Offset((page - 1) * pageSize).Find(&books).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询失败")
		return
	}
	ok(c, PageResult{Items: books, Total: total, Page: page, PageSize: pageSize})
}
