package app

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ok 统一成功响应
func ok(c *gin.Context, data any) {
	c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
}

// fail 统一失败响应
func fail(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{"success": false, "message": message})
}

// PageResult 分页结果
type PageResult struct {
	Items    any   `json:"items"`
	Total    int64 `json:"total"`
	Page     int   `json:"page"`
	PageSize int   `json:"page_size"`
}

func paginate(c *gin.Context) (page, pageSize int) {
	page = atoiDefault(c.Query("page"), 1)
	pageSize = atoiDefault(c.Query("page_size"), 12)
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 12
	}
	return page, pageSize
}

func atoiDefault(s string, def int) int {
	n := 0
	ok := true
	for _, r := range s {
		if r < '0' || r > '9' {
			ok = false
			break
		}
		n = n*10 + int(r-'0')
	}
	if !ok || s == "" {
		return def
	}
	return n
}

var slugPattern = regexp.MustCompile(`[^a-z0-9]+`)

// currentTime 统一的本地时间
func currentTime() time.Time { return time.Now() }

// slugify 生成 URL 友好的 slug；非 ASCII（如中文）标题返回空串，由调用方生成随机后缀
func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	parts := slugPattern.Split(s, -1)
	slug := strings.Trim(strings.Join(parts, "-"), "-")
	if len(slug) > 200 {
		slug = slug[:200]
	}
	return slug
}

// randomSlug 生成随机 slug
func randomSlug(prefix string) string {
	buf := make([]byte, 4)
	rand.Read(buf)
	return prefix + "-" + hex.EncodeToString(buf)
}

// validSlug 校验用户提供的 slug（小写字母/数字，中划线不能在首尾）
var slugRegex = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,196}[a-z0-9])?$`)

func validSlug(s string) bool { return slugRegex.MatchString(s) }

var usernameRegex = regexp.MustCompile(`^[a-zA-Z0-9_-]{3,50}$`)
var emailRegex = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

// uniqueSlug 在指定表上寻找可用 slug，冲突时追加数字后缀
func uniqueSlug(db *gorm.DB, table, base string) string {
	if base == "" {
		base = randomSlug(table)
	}
	candidate := base
	for i := 2; ; i++ {
		var count int64
		db.Table(table).Where("slug = ?", candidate).Count(&count)
		if count == 0 {
			return candidate
		}
		candidate = fmt.Sprintf("%s-%d", base, i)
	}
}
