// Package storage 提供图片上传的驱动抽象（M22）：
//   - local（默认）：写入数据目录 uploads/，返回 /uploads/<name> 相对地址
//   - qiniu：七牛云表单上传，返回 <domain>/<key> 绝对地址（CDN 域名）
//
// 凭据存站点配置表（storage_* / qiniu_* 键），管理端经 /storage 维护。
// 七牛令牌算法：putPolicy JSON → urlsafe base64 → HMAC-SHA1 → urlsafe base64，
// 拼接为 accessKey:encodedSign:encodedPutPolicy。
package storage

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gorm.io/gorm"
)

// Uploader 上传驱动
type Uploader interface {
	// Upload 保存文件并返回可公开访问的 URL
	Upload(name string, data []byte) (url string, err error)
}

// Config 站点配置中与存储相关的键值集合
type Config struct {
	Driver          string // local | qiniu
	QiniuAccessKey  string
	QiniuSecretKey  string
	QiniuBucket     string
	QiniuDomain     string // 如 https://cdn.example.com
	QiniuUploadHost string // 如 https://upload.qiniup.com（分区域），默认华东
}

// FromConfig 按配置选择驱动；qiniu 凭据不完整时回退 local
func FromConfig(cfg Config, dataDir string) Uploader {
	if cfg.Driver == "qiniu" && cfg.QiniuAccessKey != "" && cfg.QiniuSecretKey != "" &&
		cfg.QiniuBucket != "" && cfg.QiniuDomain != "" {
		host := cfg.QiniuUploadHost
		if host == "" {
			host = "https://upload.qiniup.com"
		}
		return &QiniuUploader{cfg: cfg, host: host}
	}
	return &LocalUploader{dataDir: dataDir}
}

// FromSettings 从站点配置表解析驱动（缺省 local）
func FromSettings(db *gorm.DB, dataDir string) Uploader {
	keys := []string{"storage_driver", "qiniu_access_key", "qiniu_secret_key", "qiniu_bucket", "qiniu_domain", "qiniu_upload_host"}
	var rows []struct {
		ConfigKey   string
		ConfigValue string
	}
	if err := db.Table("site_configs").Where("config_key IN ?", keys).Find(&rows).Error; err != nil {
		return &LocalUploader{dataDir: dataDir}
	}
	cfg := Config{}
	for _, r := range rows {
		switch r.ConfigKey {
		case "storage_driver":
			cfg.Driver = r.ConfigValue
		case "qiniu_access_key":
			cfg.QiniuAccessKey = r.ConfigValue
		case "qiniu_secret_key":
			cfg.QiniuSecretKey = r.ConfigValue
		case "qiniu_bucket":
			cfg.QiniuBucket = r.ConfigValue
		case "qiniu_domain":
			cfg.QiniuDomain = r.ConfigValue
		case "qiniu_upload_host":
			cfg.QiniuUploadHost = r.ConfigValue
		}
	}
	return FromConfig(cfg, dataDir)
}

// ── 本地驱动 ─────────────────────────────────────────────────────────────

type LocalUploader struct{ dataDir string }

func (u *LocalUploader) Upload(name string, data []byte) (string, error) {
	dir := filepath.Join(u.dataDir, "uploads")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("创建上传目录失败: %w", err)
	}
	if err := os.WriteFile(filepath.Join(dir, name), data, 0o644); err != nil {
		return "", fmt.Errorf("保存文件失败: %w", err)
	}
	return "/uploads/" + name, nil
}

// ── 七牛驱动 ─────────────────────────────────────────────────────────────

type QiniuUploader struct {
	cfg  Config
	host string
}

// urlsafeBase64 七牛约定的 urlsafe base64（不填充 =）
func urlsafeBase64(b []byte) string {
	return base64.URLEncoding.WithPadding(base64.NoPadding).EncodeToString(b)
}

// UploadToken 生成七牛上传令牌：AK:encodedSign:encodedPutPolicy
func UploadToken(accessKey, secretKey, scope string, deadline int64) string {
	policy, _ := json.Marshal(map[string]any{"scope": scope, "deadline": deadline})
	encodedPolicy := urlsafeBase64(policy)
	mac := hmac.New(sha1.New, []byte(secretKey))
	mac.Write([]byte(encodedPolicy))
	encodedSign := urlsafeBase64(mac.Sum(nil))
	return accessKey + ":" + encodedSign + ":" + encodedPolicy
}

func (u *QiniuUploader) Upload(name string, data []byte) (string, error) {
	token := UploadToken(u.cfg.QiniuAccessKey, u.cfg.QiniuSecretKey, u.cfg.QiniuBucket, time.Now().Add(time.Hour).Unix())

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	_ = writer.WriteField("token", token)
	_ = writer.WriteField("key", name)
	part, err := writer.CreateFormFile("file", name)
	if err != nil {
		return "", fmt.Errorf("构造上传请求失败: %w", err)
	}
	if _, err := part.Write(data); err != nil {
		return "", fmt.Errorf("构造上传请求失败: %w", err)
	}
	if err := writer.Close(); err != nil {
		return "", fmt.Errorf("构造上传请求失败: %w", err)
	}

	resp, err := http.Post(u.host, writer.FormDataContentType(), body)
	if err != nil {
		return "", fmt.Errorf("上传到七牛失败: %w", err)
	}
	defer resp.Body.Close()
	result, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("读取七牛响应失败: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("上传到七牛失败 (%d): %s", resp.StatusCode, strings.TrimSpace(string(result)))
	}
	var parsed struct {
		Key string `json:"key"`
	}
	if err := json.Unmarshal(result, &parsed); err != nil || parsed.Key == "" {
		return "", fmt.Errorf("七牛响应异常: %s", strings.TrimSpace(string(result)))
	}
	return strings.TrimRight(u.cfg.QiniuDomain, "/") + "/" + parsed.Key, nil
}
