package app

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// installGate 未安装时拦截除安装向导外的全部业务 API
func (a *App) installGate() gin.HandlerFunc {
	return func(c *gin.Context) {
		if a.Config.Installed || strings.HasPrefix(c.Request.URL.Path, "/api/v1/setup/") {
			c.Next()
			return
		}
		c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{
			"success": false,
			"code":    "NOT_INSTALLED",
			"message": "系统尚未安装，请先完成安装向导",
		})
	}
}

// Router 组装全部路由
func (a *App) Router() *gin.Engine {
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery(), CORS())
	r.MaxMultipartMemory = 10 << 20

	// 健康检查（CI 与 nginx 使用）
	r.GET("/health", a.Health)
	r.GET("/api/v1/health", a.Health)

	a.ServeUploads(r)

	api := r.Group("/api/v1", a.installGate())
	{
		// 安装向导
		api.GET("/setup/status", a.SetupStatus)
		api.POST("/setup/test-connection", a.SetupTest)
		api.POST("/setup/install", a.SetupInstall)

		// 公开接口
		api.GET("/site", a.GetSiteConfig)
		api.GET("/stats", a.SiteStats)
		api.GET("/explore/hot", a.ExploreHot)
		api.GET("/explore/latest", a.ExploreLatest)
		api.GET("/users/:username", a.GetUserProfile)
		api.GET("/users/:username/books", a.GetUserBooks)

		// 登录注册（无需令牌）
		api.POST("/auth/register", a.Register)
		api.POST("/auth/login", a.Login)

		// 认证相关（强制登录）
		authed := api.Group("", a.RequireAuth())
		{
			authed.GET("/auth/me", a.Me)
			authed.PUT("/auth/profile", a.UpdateProfile)
			authed.PUT("/auth/password", a.ChangePassword)
			authed.POST("/upload", a.Upload)
			authed.GET("/books/summary", a.BookSummary)
			authed.POST("/books", a.CreateBook)
			authed.PUT("/books/:id", a.UpdateBook)
			authed.DELETE("/books/:id", a.DeleteBook)
			authed.POST("/books/:id/documents", a.CreateDocument)
			authed.PUT("/documents/:id", a.UpdateDocument)
			authed.DELETE("/documents/:id", a.DeleteDocument)
			authed.PUT("/site", a.UpdateSiteConfig)

			// 系统管理（仅管理员）
			admin := authed.Group("", a.RequireAdmin())
			{
				admin.GET("/system/version", a.SystemVersion)
				admin.POST("/system/upgrade", a.SystemUpgrade)
			}
		}

		// 公开读取接口（可选登录，用于私有内容权限判断）
		public := api.Group("", a.OptionalAuth())
		{
			public.GET("/books", a.ListBooks)
			public.GET("/books/:id", a.GetBook)
			public.GET("/books/slug/:slug", a.GetBookBySlug)
			public.GET("/books/:id/documents", a.ListDocumentTree)
			public.GET("/books/:id/documents/slug/:slug", a.GetDocumentBySlug)
			public.GET("/documents/:id", a.GetDocument)
			public.POST("/books/:id/view", a.IncrementBookView)
		}
	}

	RegisterWeb(r)
	return r
}
