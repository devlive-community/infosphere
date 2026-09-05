package app

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"infosphere/server/internal/config"

	"github.com/gin-gonic/gin"
)

var allowedImageExts = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".webp": true, ".svg": true, ".ico": true,
}

const maxUploadSize = 10 << 20 // 10MB

// Upload POST /upload 上传图片到本地数据目录
func (a *App) Upload(c *gin.Context) {
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		fail(c, http.StatusBadRequest, "请选择要上传的文件")
		return
	}
	defer file.Close()

	if header.Size > maxUploadSize {
		fail(c, http.StatusBadRequest, "文件不能超过 10MB")
		return
	}
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !allowedImageExts[ext] {
		fail(c, http.StatusBadRequest, "仅支持 png/jpg/jpeg/gif/webp/svg/ico 图片")
		return
	}

	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		fail(c, http.StatusInternalServerError, "生成文件名失败")
		return
	}
	name := time.Now().Format("20060102") + "-" + hex.EncodeToString(buf)[:8] + ext

	dir := filepath.Join(config.DataDir(), "uploads")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		fail(c, http.StatusInternalServerError, "创建上传目录失败")
		return
	}
	dst := filepath.Join(dir, name)
	if err := c.SaveUploadedFile(header, dst); err != nil {
		fail(c, http.StatusInternalServerError, "保存文件失败: "+err.Error())
		return
	}
	ok(c, gin.H{"url": "/uploads/" + name})
}

// ServeUploads 将数据目录中的上传文件挂载到 /uploads
func (a *App) ServeUploads(r *gin.Engine) {
	dir := filepath.Join(config.DataDir(), "uploads")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		fmt.Println("创建上传目录失败:", err)
		return
	}
	r.Static("/uploads", dir)
}
