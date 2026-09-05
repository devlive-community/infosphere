package app

import (
	"net/http"
	"strconv"
	"strings"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

// ListTags GET /tags 标签列表（含公开书籍使用计数）
func (a *App) ListTags(c *gin.Context) {
	limit := atoiDefault(c.Query("limit"), 50)
	if limit < 1 || limit > 200 {
		limit = 50
	}
	q := strings.TrimSpace(c.Query("q"))

	query := a.DB.Model(&models.Tag{}).
		Select("tags.id, tags.name, tags.slug, COUNT(book_tags.book_id) AS book_count").
		Joins("JOIN book_tags ON book_tags.tag_id = tags.id").
		Joins("JOIN books ON books.id = book_tags.book_id AND books.is_public = 1 AND books.status = 'published'").
		Group("tags.id")
	if q != "" {
		query = query.Where("tags.name LIKE ?", "%"+q+"%")
	}
	var tags []models.Tag
	if err := query.Order("book_count DESC").Limit(limit).Find(&tags).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询失败")
		return
	}
	ok(c, tags)
}

// CreateTag POST /tags 创建标签
func (a *App) CreateTag(c *gin.Context) {
	var req struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Name) == "" {
		fail(c, http.StatusBadRequest, "请填写标签名称")
		return
	}
	name := strings.TrimSpace(req.Name)
	if len([]rune(name)) > 50 {
		fail(c, http.StatusBadRequest, "标签名称过长（最多 50 字）")
		return
	}

	tag, err := a.findOrCreateTag(name)
	if err != nil {
		fail(c, http.StatusInternalServerError, "创建标签失败: "+err.Error())
		return
	}
	ok(c, tag)
}

// DeleteTag DELETE /tags/:id 删除标签并解绑全部书籍（仅管理员）
func (a *App) DeleteTag(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	var tag models.Tag
	if err := a.DB.First(&tag, id).Error; err != nil {
		fail(c, http.StatusNotFound, "标签不存在")
		return
	}
	if err := a.DB.Model(&tag).Association("Books").Clear(); err != nil {
		fail(c, http.StatusInternalServerError, "解绑书籍失败: "+err.Error())
		return
	}
	if err := a.DB.Delete(&tag).Error; err != nil {
		fail(c, http.StatusInternalServerError, "删除失败: "+err.Error())
		return
	}
	ok(c, gin.H{"message": "已删除"})
}

// BooksByTag GET /tags/:slug/books 按标签查询公开书籍
func (a *App) BooksByTag(c *gin.Context) {
	page, pageSize := paginate(c)
	slug := c.Param("slug")

	var tag models.Tag
	if err := a.DB.Where("slug = ?", slug).First(&tag).Error; err != nil {
		fail(c, http.StatusNotFound, "标签不存在")
		return
	}

	base := a.DB.Model(&models.Book{}).
		Joins("JOIN book_tags ON book_tags.book_id = books.id").
		Joins("JOIN tags ON tags.id = book_tags.tag_id AND tags.slug = ?", slug).
		Where("books.is_public = ? AND books.status = ?", true, "published")

	var total int64
	if err := base.Count(&total).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询失败")
		return
	}
	var books []models.Book
	if err := preloadBookUser(base).
		Order("books.created_at DESC").
		Limit(pageSize).Offset((page - 1) * pageSize).
		Find(&books).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询失败")
		return
	}
	ok(c, PageResult{Items: books, Total: total, Page: page, PageSize: pageSize})
}

// findOrCreateTag 按名称查找或创建标签（slug 冲突时追加后缀）
func (a *App) findOrCreateTag(name string) (*models.Tag, error) {
	var tag models.Tag
	if err := a.DB.Where("name = ?", name).First(&tag).Error; err == nil {
		return &tag, nil
	}
	slug := slugify(name)
	if slug == "" {
		slug = randomSlug("tag")
	}
	tag = models.Tag{Name: name, Slug: slug}
	for i := 0; i < 50; i++ {
		candidate := tag.Slug
		if i > 0 {
			candidate = slug + "-" + strconv.Itoa(i+1)
		}
		var count int64
		a.DB.Model(&models.Tag{}).Where("slug = ?", candidate).Count(&count)
		if count == 0 {
			tag.Slug = candidate
			break
		}
	}
	if err := a.DB.Create(&tag).Error; err != nil {
		// 并发下唯一键冲突时回退为查询已有记录
		var existing models.Tag
		if err := a.DB.Where("name = ?", name).First(&existing).Error; err == nil {
			return &existing, nil
		}
		return nil, err
	}
	return &tag, nil
}

// syncBookTags 将书籍标签同步为请求给定的名称列表（find-or-create + 全量替换）
func (a *App) syncBookTags(book *models.Book, names []string) error {
	var tags []models.Tag
	seen := map[string]bool{}
	for _, raw := range names {
		name := strings.TrimSpace(raw)
		if name == "" || seen[name] || len(seen) >= 10 {
			continue
		}
		seen[name] = true
		tag, err := a.findOrCreateTag(name)
		if err != nil {
			return err
		}
		tags = append(tags, *tag)
	}
	return a.DB.Model(book).Association("Tags").Replace(&tags)
}
