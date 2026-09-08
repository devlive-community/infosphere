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

			// ── 找回密码（auth:password-reset 匿名语义） ──
			authGroup.POST("/password/forgot", a.ForgotPassword)
			authGroup.POST("/password/reset", a.ResetPassword)

			// ── 第三方登录（auth:oauth；start/callback 匿名，绑定管理需登录） ──
			authGroup.GET("/oauth/providers", a.OAuthProviders)
			authGroup.GET("/oauth/:provider", a.OAuthStart)
			authGroup.GET("/oauth/:provider/callback", a.OAuthCallback)
			authed2 := authGroup.Group("", a.RequireAuth())
			{
				authed2.GET("/oauth/bindings", a.RequirePermission(authz.AuthOauth), a.OAuthBindings)
				authed2.DELETE("/oauth/:provider", a.RequirePermission(authz.AuthOauth), a.OAuthUnbind)
			}

			authed := authGroup.Group("", a.RequireAuth())
			{
				authed.GET("/me", a.Me)
				authed.GET("/permissions", a.CurrentPermissions) // 当前用户权限列表
				authed.PUT("/profile", a.RequirePermission(authz.UserUpdate), a.UpdateProfile)
				authed.PUT("/password", a.RequirePermission(authz.UserUpdate), a.ChangePassword)
				// 导出样式偏好（PDF 导出用）
				authed.GET("/export-settings", a.RequirePermission(authz.UserRead), a.GetExportSettings)
				authed.PUT("/export-settings", a.RequirePermission(authz.UserUpdate), a.UpdateExportSettings)
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
			// PDF 导出（依赖 pdf-export 插件；公开且开放导出的书籍匿名可导，鉴权在 handler 内）
			public.GET("/books/:id/export/pdf", a.ExportBookPDF)
			public.POST("/documents/:id/view", a.IncrementDocumentView)
		}

		// ── 书籍管理（book:*，归属校验在 handler 内） ──
		books := api.Group("/books", a.RequireAuth())
		{
			books.POST("", a.RequirePermission(authz.BookCreate), a.CreateBook)
			books.GET("/status-counts", a.RequirePermission(authz.BookRead), a.MyBookCounts)
			books.GET("/slug/:slug/access", a.RequirePermission(authz.BookRead), a.GetBookAccess)
			books.PUT("/:id", a.RequirePermission(authz.BookUpdate), a.UpdateBook)
			books.DELETE("/:id", a.RequirePermission(authz.BookDelete), a.DeleteBook)
			books.GET("/:id/export", a.RequirePermission(authz.BookExport), a.ExportBook)
			books.POST("/:id/import/pdf", a.RequirePermission(authz.BookImport), a.ReimportPDFBook)
			books.GET("/:id/read-chapters", a.RequirePermission(authz.UserRead), a.ReadChapters)

			// ── 协作者管理（collaborator:*；归属校验在 handler 内） ──
			books.GET("/:id/collaborators", a.RequirePermission(authz.CollaboratorRead), a.ListCollaborators)
			books.POST("/:id/collaborators", a.RequirePermission(authz.CollaboratorCreate), a.AddCollaborator)
			books.DELETE("/:id/collaborators/:userId", a.RequirePermission(authz.CollaboratorDelete), a.RemoveCollaborator)
		}

		// ── 回收站（trash:*；恢复与永久删除继续执行对象级归属校验） ──
		trash := api.Group("/trash", a.RequireAuth())
		{
			trash.GET("", a.RequirePermission(authz.TrashRead), a.ListTrash)
			trash.POST("/books/:id/restore", a.RequirePermission(authz.TrashRestore), a.RestoreTrashedBook)
			trash.DELETE("/books/:id", a.RequirePermission(authz.TrashDelete), a.PermanentlyDeleteBook)
			trash.POST("/documents/:id/restore", a.RequirePermission(authz.TrashRestore), a.RestoreTrashedDocument)
			trash.DELETE("/documents/:id", a.RequirePermission(authz.TrashDelete), a.PermanentlyDeleteDocument)
		}

		// ── 文档管理（document:*，归属校验在 handler 内） ──
		docs := api.Group("", a.RequireAuth())
		{
			docs.POST("/books/:id/documents", a.RequirePermission(authz.DocumentCreate), a.CreateDocument)
			docs.POST("/books/:id/documents/import-web", a.RequirePermission(authz.DocumentCreate), a.ImportWebDocument)
			docs.PUT("/documents/:id", a.RequirePermission(authz.DocumentUpdate), a.UpdateDocument)
			docs.DELETE("/documents/:id", a.RequirePermission(authz.DocumentDelete), a.DeleteDocument)
			docs.GET("/documents/:id/revisions", a.RequirePermission(authz.DocumentRevisionRead), a.ListDocumentRevisions)
			docs.GET("/documents/:id/revisions/:revisionId", a.RequirePermission(authz.DocumentRevisionRead), a.GetDocumentRevision)
			docs.POST("/documents/:id/revisions/:revisionId/restore", a.RequirePermission(authz.DocumentRevisionRestore), a.RestoreDocumentRevision)
		}

		// ── 全文搜索（search:read，匿名可搜公开内容） ──
		api.GET("/search", a.OptionalAuth(), a.GlobalSearch)

		// ── 导入书籍（book:import，ZIP / PDF / 网页成为本人的书籍） ──
		api.POST("/import", a.RequireAuth(), a.RequirePermission(authz.BookImport), a.ImportBook)
		api.POST("/import/pdf", a.RequireAuth(), a.RequirePermission(authz.BookImport), a.ImportPDFBook)
		api.POST("/import/web", a.RequireAuth(), a.RequirePermission(authz.BookImport), a.ImportWebBook)

		// ── 站内通知（notification:*；SSE 端点自行鉴权，EventSource 无法带请求头） ──
		notif := api.Group("/notifications", a.RequireAuth())
		{
			notif.GET("", a.RequirePermission(authz.NotificationRead), a.ListNotifications)
			notif.POST("/read", a.RequirePermission(authz.NotificationUpdate), a.MarkNotificationsRead)
		}
		api.GET("/notifications/stream", a.SSENotifications)

		// ── 评论（comment:*） ──
		api.GET("/documents/:id/comments", a.OptionalAuth(), a.ListComments)
		api.POST("/documents/:id/comments", a.RequireAuth(), a.RequirePermission(authz.CommentCreate), a.CreateComment)
		api.PUT("/comments/:id", a.RequireAuth(), a.RequirePermission(authz.CommentUpdate), a.UpdateComment)
		api.DELETE("/comments/:id", a.RequireAuth(), a.RequirePermission(authz.CommentDelete), a.DeleteComment)

		// ── 点赞/收藏（reaction:*） ──
		books.POST("/:id/reactions", a.RequireAuth(), a.RequirePermission(authz.ReactionCreate), a.PutReaction)
		books.DELETE("/:id/reactions", a.RequireAuth(), a.RequirePermission(authz.ReactionDelete), a.DeleteReaction)
		books.GET("/:id/reactions/me", a.RequireAuth(), a.RequirePermission(authz.ReactionRead), a.MyBookReaction)
		api.GET("/users/me/reactions", a.RequireAuth(), a.RequirePermission(authz.ReactionRead), a.MyReactions)

		// ── 阅读进度（user 语义，读自己写自己） ──
		progress := api.Group("/reading-progress", a.RequireAuth())
		{
			progress.GET("/:bookId", a.RequirePermission(authz.ReadingProgressRead), a.GetReadingProgress)
			progress.PUT("/:bookId", a.RequirePermission(authz.ReadingProgressUpdate), a.SaveReadingProgress)
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
			admin.GET("/oauth", a.RequirePermission(authz.SiteUpdate), a.AdminGetOAuth)
			admin.PUT("/oauth", a.RequirePermission(authz.SiteUpdate), a.AdminSaveOAuth)
			admin.GET("/mail", a.RequirePermission(authz.SiteUpdate), a.AdminGetMail)
			admin.PUT("/mail", a.RequirePermission(authz.SiteUpdate), a.AdminSaveMail)
			admin.GET("/storage", a.RequirePermission(authz.SiteUpdate), a.AdminGetStorage)
			admin.PUT("/storage", a.RequirePermission(authz.SiteUpdate), a.AdminSaveStorage)
			admin.GET("/system/version", a.RequirePermission(authz.SystemRead), a.SystemVersion)
			admin.POST("/system/upgrade", a.RequirePermission(authz.SystemUpgrade), a.SystemUpgrade)

			// 用户管理（user:manage，仅管理员）。独立 /admin 前缀与公开 /users/:username 区分
			admin.GET("/admin/users", a.RequirePermission(authz.UserManage), a.AdminListUsers)
			admin.PUT("/admin/users/:id/role", a.RequirePermission(authz.UserManage), a.AdminUpdateUserRole)
			admin.PUT("/admin/users/:id/status", a.RequirePermission(authz.UserManage), a.AdminUpdateUserStatus)
			admin.DELETE("/admin/users/:id", a.RequirePermission(authz.UserManage), a.AdminDeleteUser)
			// 书籍管理：列出全站所有可见性与状态的书籍；更新与删除复用 book:* 对象权限端点
			admin.GET("/admin/books", a.RequirePermission(authz.BookRead), a.AdminListBooks)
			// 章节管理：只列元数据；更新与删除复用 document:* 对象权限端点
			admin.GET("/admin/documents", a.RequirePermission(authz.DocumentRead), a.AdminListDocuments)
			// 控制台首页时间线（user:manage，仅管理员）：最近注册用户 + 最近建书（不限可见性）
			admin.GET("/admin/activity", a.RequirePermission(authz.UserManage), a.AdminActivity)
			admin.GET("/admin/stats", a.RequirePermission(authz.StatsRead), a.AdminStats)

			// 通用系统配置（config:manage，仅管理员）：任意 key-value 配置的增删改查
			admin.GET("/admin/configs", a.RequirePermission(authz.ConfigManage), a.AdminListConfigs)
			admin.PUT("/admin/configs", a.RequirePermission(authz.ConfigManage), a.AdminUpsertConfig)
			admin.DELETE("/admin/configs/:key", a.RequirePermission(authz.ConfigManage), a.AdminDeleteConfig)

			// 插件管理（plugin:manage，仅管理员）：安装/卸载 PDF 导出等后台插件
			admin.GET("/admin/plugins", a.RequirePermission(authz.PluginManage), a.AdminListPlugins)
			admin.POST("/admin/plugins/:key/install", a.RequirePermission(authz.PluginManage), a.AdminInstallPlugin)
			admin.POST("/admin/plugins/:key/uninstall", a.RequirePermission(authz.PluginManage), a.AdminUninstallPlugin)
		}
	}

	RegisterWeb(r, a.web)
	return r
}
