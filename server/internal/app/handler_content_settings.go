package app

import (
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// 内容设置（存 site_configs）：上传大小/类型限制、全站评论开关。
const (
	cfgUploadMaxMB     = "upload_max_mb"
	cfgUploadExts      = "upload_allowed_exts"
	cfgCommentsEnabled = "comments_enabled"
)

// uploadMaxBytes 允许的最大上传字节数（默认 10MB，范围 1-100MB）。
func (a *App) uploadMaxBytes() int64 {
	n := atoiDefault(a.getSetting(cfgUploadMaxMB), 10)
	if n < 1 {
		n = 1
	} else if n > 100 {
		n = 100
	}
	return int64(n) << 20
}

func (a *App) uploadMaxMB() int { return int(a.uploadMaxBytes() >> 20) }

// uploadAllowedExts 允许的文件扩展名集合（带点、小写）；未配置回退到内置图片集合。
func (a *App) uploadAllowedExts() map[string]bool {
	raw := strings.TrimSpace(a.getSetting(cfgUploadExts))
	if raw == "" {
		return allowedImageExts
	}
	set := map[string]bool{}
	for _, e := range strings.Split(raw, ",") {
		e = strings.ToLower(strings.TrimSpace(e))
		if e == "" {
			continue
		}
		if !strings.HasPrefix(e, ".") {
			e = "." + e
		}
		set[e] = true
	}
	if len(set) == 0 {
		return allowedImageExts
	}
	return set
}

func (a *App) uploadExtsString() string {
	keys := make([]string, 0)
	for e := range a.uploadAllowedExts() {
		keys = append(keys, e)
	}
	sort.Strings(keys)
	return strings.Join(keys, ",")
}

// commentsEnabled 全站评论开关（默认开启）。
func (a *App) commentsEnabled() bool { return a.getSetting(cfgCommentsEnabled) != "false" }

// ---- 管理员：内容设置 ----

type contentSettings struct {
	UploadMaxMB       int    `json:"upload_max_mb"`
	UploadAllowedExts string `json:"upload_allowed_exts"`
	CommentsEnabled   bool   `json:"comments_enabled"`
}

// GetContentSettings GET /content-settings（管理员）
func (a *App) GetContentSettings(c *gin.Context) {
	ok(c, contentSettings{
		UploadMaxMB:       a.uploadMaxMB(),
		UploadAllowedExts: a.uploadExtsString(),
		CommentsEnabled:   a.commentsEnabled(),
	})
}

// UpdateContentSettings PUT /content-settings（管理员）
func (a *App) UpdateContentSettings(c *gin.Context) {
	var req contentSettings
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	mb := req.UploadMaxMB
	if mb < 1 {
		mb = 1
	} else if mb > 100 {
		mb = 100
	}
	// 归一化扩展名：小写、补点、去重
	set := map[string]bool{}
	for _, e := range strings.Split(req.UploadAllowedExts, ",") {
		e = strings.ToLower(strings.TrimSpace(e))
		if e == "" {
			continue
		}
		if !strings.HasPrefix(e, ".") {
			e = "." + e
		}
		set[e] = true
	}
	exts := make([]string, 0, len(set))
	for e := range set {
		exts = append(exts, e)
	}
	sort.Strings(exts)

	boolStr := func(v bool) string {
		if v {
			return "true"
		}
		return "false"
	}
	_ = a.setSetting(cfgUploadMaxMB, strconv.Itoa(mb), "上传文件最大大小（MB）")
	_ = a.setSetting(cfgUploadExts, strings.Join(exts, ","), "允许上传的文件扩展名（逗号分隔）")
	_ = a.setSetting(cfgCommentsEnabled, boolStr(req.CommentsEnabled), "全站评论开关")
	a.GetContentSettings(c)
}
