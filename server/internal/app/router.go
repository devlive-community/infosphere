package app

import (
	"net/http"
	"strings"

	"infosphere/server/internal/authz"

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

// Router 组装全部路由。
//
// 路由按功能域分组注册（详见 docs/api.md）：
//
//	基础     健康检查（无业务权限）
//	安装向导  仅未安装时可用
//	认证     注册/登录/会话
//	公开内容  站点配置、统计、发现、书籍/文档只读、用户主页（匿名可访问，可选登录扩大可见范围）
//	书籍管理  book:*
//	文档管理  document:*
//	用户     user:*
//	上传     upload:*
//	站点与系统管理  site:* / system:*（仅管理员）
func (a *App) Router() *gin.Engine {
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery(), CORS())
	r.MaxMultipartMemory = 10 << 20

	// ── 基础：健康检查（CI 与 nginx 使用，无业务权限） ──
	r.GET("/health", a.Health)
	r.GET("/api/v1/health", a.Health)

	a.ServeUploads(r)

	api := r.Group("/api/v1", a.installGate())
	{
		// ── 安装向导（仅未安装时可用，无业务权限） ──
		setup := api.Group("/setup")
		{
			setup.GET("/status", a.SetupStatus)
			setup.POST("/test-connection", a.SetupTest)
			setup.POST("/install", a.SetupInstall)
		}

		// ── 认证与会话 ──
		authGroup := api.Group("/auth")
		{
			authGroup.POST("/register", a.Register)
			authGroup.POST("/login", a.Login)

			authed := authGroup.Group("", a.RequireAuth())
			{
				authed.GET("/me", a.Me)
				authed.GET("/permissions", a.CurrentPermissions) // 当前用户权限列表
				authed.PUT("/profile", a.RequirePermission(authz.UserUpdate), a.UpdateProfile)
				authed.PUT("/password", a.RequirePermission(authz.UserUpdate), a.ChangePassword)
			}
		}

		// ── 公开内容：匿名可访问，可选登录以查看自己可见的私有内容 ──
		// 语义权限：site:read / stats:read / book:read / document:read / user:read
		public := api.Group("", a.OptionalAuth())
		{
			public.GET("/site", a.GetSiteConfig)
			public.GET("/stats", a.SiteStats)
			public.GET("/explore/hot", a.ExploreHot)
			public.GET("/explore/latest", a.ExploreLatest)
			public.GET("/users/:username", a.GetUserProfile)
			public.GET("/users/:username/books", a.GetUserBooks)

			public.GET("/books", a.ListBooks) // mine=true 时要求登录
			public.GET("/books/:id", a.GetBook)
			public.GET("/books/slug/:slug", a.GetBookBySlug)
			public.GET("/books/:id/documents", a.ListDocumentTree)
			public.GET("/books/:id/documents/slug/:slug", a.GetDocumentBySlug)
			public.GET("/documents/:id", a.GetDocument)
			public.GET("/tags", a.ListTags)
			public.GET("/tags/:slug/books", a.BooksByTag)
			public.POST("/books/:id/view", a.IncrementBookView)
		}

		// ── 书籍管理（book:*，归属校验在 handler 内） ──
		books := api.Group("/books", a.RequireAuth())
		{
			books.POST("", a.RequirePermission(authz.BookCreate), a.CreateBook)
			books.PUT("/:id", a.RequirePermission(authz.BookUpdate), a.UpdateBook)
			books.DELETE("/:id", a.RequirePermission(authz.BookDelete), a.DeleteBook)
		}

		// ── 文档管理（document:*，归属校验在 handler 内） ──
		docs := api.Group("", a.RequireAuth())
		{
			docs.POST("/books/:id/documents", a.RequirePermission(authz.DocumentCreate), a.CreateDocument)
			docs.PUT("/documents/:id", a.RequirePermission(authz.DocumentUpdate), a.UpdateDocument)
			docs.DELETE("/documents/:id", a.RequirePermission(authz.DocumentDelete), a.DeleteDocument)
		}

		// ── 上传 ──
		api.POST("/upload", a.RequireAuth(), a.RequirePermission(authz.UploadCreate), a.Upload)

		// ── 标签管理（tag:*；登录用户可创建，删除仅管理员） ──
		tags := api.Group("/tags", a.RequireAuth())
		{
			tags.POST("", a.RequirePermission(authz.TagCreate), a.CreateTag)
			tags.DELETE("/:id", a.RequirePermission(authz.TagDelete), a.DeleteTag)
		}

		// ── 站点与系统管理（仅管理员） ──
		admin := api.Group("", a.RequireAuth(), a.RequireAdmin())
		{
			admin.PUT("/site", a.RequirePermission(authz.SiteUpdate), a.UpdateSiteConfig)
			admin.GET("/system/version", a.RequirePermission(authz.SystemRead), a.SystemVersion)
			admin.POST("/system/upgrade", a.RequirePermission(authz.SystemUpgrade), a.SystemUpgrade)
		}
	}

	RegisterWeb(r)
	return r
}
