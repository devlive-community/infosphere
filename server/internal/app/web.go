package app

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// RegisterWeb 兜底路由：生产部署中页面由 infosphere-web（Next.js SSR）服务，
// 此处仅处理直接访问 API 端口且未命中任何路由的请求。
func RegisterWeb(r *gin.Engine) {
	r.NoRoute(func(c *gin.Context) {
		p := c.Request.URL.Path
		if !strings.HasPrefix(p, "/api/") && !strings.HasPrefix(p, "/uploads/") {
			c.Data(http.StatusNotFound, "text/html; charset=utf-8", []byte(placeholderPage))
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "接口不存在"})
	})
}

const placeholderPage = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>InfoSphere</title></head>
<body style="font-family:sans-serif;padding:40px;text-align:center;color:#475569;">
<h1>InfoSphere</h1>
<p>此端口仅提供 API 服务。页面由 infosphere-web（Next.js SSR）提供，请通过 nginx 入口访问。</p>
<p style="color:#94a3b8">部署方式参见仓库 deploy/ 目录与 README。</p>
</body></html>
`
