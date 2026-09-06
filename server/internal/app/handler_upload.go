package app

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"infosphere/server/internal/config"
	"infosphere/server/internal/storage"

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

	data, err := io.ReadAll(file)
	if err != nil {
		fail(c, http.StatusBadRequest, "读取文件失败")
		return
	}
	uploader := storage.FromSettings(a.DB, config.DataDir())
	url, err := uploader.Upload(name, data)
	if err != nil {
		fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	ok(c, gin.H{"url": url})
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

// M22 存储驱动配置（local | qiniu），凭据存站点配置表，不出现在公开 /site

var storageDrivers = map[string]bool{"local": true, "qiniu": true}

type storageConfigUpdate struct {
	Driver          *string `json:"driver"`
	QiniuAccessKey  *string `json:"qiniu_access_key"`
	QiniuSecretKey  *string `json:"qiniu_secret_key"`
	QiniuBucket     *string `json:"qiniu_bucket"`
	QiniuDomain     *string `json:"qiniu_domain"`
	QiniuUploadHost *string `json:"qiniu_upload_host"`
}

// AdminGetStorage GET /storage 管理员读取存储配置
func (a *App) AdminGetStorage(c *gin.Context) {
	ok(c, gin.H{
		"driver":            a.getSetting("storage_driver"),
		"qiniu_access_key":  a.getSetting("qiniu_access_key"),
		"qiniu_secret_key":  a.getSetting("qiniu_secret_key"),
		"qiniu_bucket":      a.getSetting("qiniu_bucket"),
		"qiniu_domain":      a.getSetting("qiniu_domain"),
		"qiniu_upload_host": a.getSetting("qiniu_upload_host"),
	})
}

// AdminSaveStorage PUT /storage 管理员保存存储配置
func (a *App) AdminSaveStorage(c *gin.Context) {
	var req storageConfigUpdate
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if req.Driver != nil {
		driver := *req.Driver
		if !storageDrivers[driver] {
			fail(c, http.StatusBadRequest, "存储驱动必须为 local 或 qiniu")
			return
		}
		if err := a.setSetting("storage_driver", driver, "上传存储驱动 local|qiniu"); err != nil {
			fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
			return
		}
	}
	for _, item := range []struct {
		key   string
		value *string
		desc  string
	}{
		{"qiniu_access_key", req.QiniuAccessKey, "七牛 Access Key"},
		{"qiniu_secret_key", req.QiniuSecretKey, "七牛 Secret Key"},
		{"qiniu_bucket", req.QiniuBucket, "七牛存储空间名"},
		{"qiniu_domain", req.QiniuDomain, "七牛 CDN 绑定域名（含 https://）"},
		{"qiniu_upload_host", req.QiniuUploadHost, "七牛上传区域地址"},
	} {
		if item.value == nil {
			continue
		}
		if (item.key == "qiniu_domain" || item.key == "qiniu_upload_host") && strings.TrimSpace(*item.value) != "" &&
			!strings.HasPrefix(*item.value, "http://") && !strings.HasPrefix(*item.value, "https://") {
			fail(c, http.StatusBadRequest, item.desc+"必须以 http(s):// 开头")
			return
		}
		if err := a.setSetting(item.key, strings.TrimSpace(*item.value), item.desc); err != nil {
			fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
			return
		}
	}
	ok(c, gin.H{"message": "已保存"})
}
