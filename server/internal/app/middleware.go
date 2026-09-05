package app

import (
	"net/http"
	"strings"

	"infosphere/server/internal/auth"
	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

// CORS 允许跨域，便于桌面端与开发模式下的前端访问
func CORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Authorization")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

// currentUser 从上下文取出可选登录用户（配合 RequireAuth / OptionalAuth 使用）
func currentUser(c *gin.Context) *models.User {
	if v, ok := c.Get("user"); ok {
		if u, ok := v.(*models.User); ok {
			return u
		}
	}
	return nil
}

// RequireAuth 强制登录中间件
func (a *App) RequireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		u := a.resolveUser(c)
		if u == nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"success": false, "message": "请先登录"})
			return
		}
		c.Set("user", u)
		c.Next()
	}
}

// OptionalAuth 尝试解析登录态但不强制
func (a *App) OptionalAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		if u := a.resolveUser(c); u != nil {
			c.Set("user", u)
		}
		c.Next()
	}
}

func (a *App) resolveUser(c *gin.Context) *models.User {
	header := c.GetHeader("Authorization")
	if header == "" {
		return nil
	}
	token := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
	if token == "" || a.Config.Secret == "" {
		return nil
	}
	claims, err := auth.ParseToken(a.Config.Secret, token)
	if err != nil {
		return nil
	}
	var u models.User
	if err := a.DB.First(&u, claims.UserID).Error; err != nil {
		return nil
	}
	if !u.IsActive {
		return nil
	}
	return &u
}

// IsAdmin 判断用户是否管理员
func IsAdmin(u *models.User) bool {
	return u != nil && u.Role == "admin"
}

// RequireAdmin 强制管理员权限中间件
func (a *App) RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		u := currentUser(c)
		if !IsAdmin(u) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"success": false, "message": "需要管理员权限"})
			return
		}
		c.Next()
	}
}
