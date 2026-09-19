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
		Select("tags.id, tags.name, tags.slug, tags.icon_type, tags.icon_value, COUNT(book_tags.book_id) AS book_count").
		Joins("JOIN book_tags ON book_tags.tag_id = tags.id").
		Joins("JOIN books ON books.id = book_tags.book_id").
		Where("books.is_public = ? AND books.status IN ?", true, publiclyReadableBookStatuses).
		Group("tags.id")
	if currentUser(c) == nil {
		query = query.Where("books.login_required = ?", false)
	}
	if q != "" {
		query = query.Where("tags.name LIKE ?", "%"+q+"%")
	}
	tags := []models.Tag{}
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
	if err := a.DB.Where("tag_id = ?", tag.ID).Delete(&models.BookTag{}).Error; err != nil {
		fail(c, http.StatusInternalServerError, "解绑书籍失败: "+err.Error())
		return
	}
	if err := a.DB.Delete(&tag).Error; err != nil {
		fail(c, http.StatusInternalServerError, "删除失败: "+err.Error())
		return
	}
	ok(c, gin.H{"message": "已删除"})
}

func validTagIconType(t string) bool {
	return t == "" || t == "fa" || t == "image" || t == "svg"
}

// AdminListTags GET /admin/tags 后台标签管理：列出全部标签（含总使用计数），支持搜索与分页
func (a *App) AdminListTags(c *gin.Context) {
	page, pageSize := paginate(c)
	q := strings.TrimSpace(c.Query("q"))

	countQuery := a.DB.Model(&models.Tag{})
	if q != "" {
		countQuery = countQuery.Where("name LIKE ?", "%"+q+"%")
	}
	var total int64
	countQuery.Count(&total)

	query := a.DB.Model(&models.Tag{}).
		Select("tags.id, tags.name, tags.slug, tags.icon_type, tags.icon_value, tags.created_at, COUNT(book_tags.book_id) AS book_count").
		Joins("LEFT JOIN book_tags ON book_tags.tag_id = tags.id").
		Group("tags.id")
	if q != "" {
		query = query.Where("tags.name LIKE ?", "%"+q+"%")
	}
	tags := []models.Tag{}
	if err := query.Order("book_count DESC, tags.id DESC").
		Limit(pageSize).Offset((page - 1) * pageSize).Find(&tags).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询失败")
		return
	}
	ok(c, PageResult{Items: tags, Total: total, Page: page, PageSize: pageSize})
}

// AdminCreateTag POST /admin/tags 后台创建标签（可带图标）
func (a *App) AdminCreateTag(c *gin.Context) {
	var req struct {
		Name      string `json:"name"`
		IconType  string `json:"icon_type"`
		IconValue string `json:"icon_value"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Name) == "" {
		fail(c, http.StatusBadRequest, "请填写标签名称")
		return
	}
	if !validTagIconType(req.IconType) {
		fail(c, http.StatusBadRequest, "图标类型无效")
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
	if err := a.DB.Model(tag).Updates(map[string]any{"icon_type": req.IconType, "icon_value": strings.TrimSpace(req.IconValue)}).Error; err != nil {
		fail(c, http.StatusInternalServerError, "保存图标失败: "+err.Error())
		return
	}
	ok(c, tag)
}

// AdminUpdateTag PUT /admin/tags/:id 后台更新标签名称与图标（slug 保持不变，避免破坏既有链接）
func (a *App) AdminUpdateTag(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	var req struct {
		Name      string `json:"name"`
		IconType  string `json:"icon_type"`
		IconValue string `json:"icon_value"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Name) == "" {
		fail(c, http.StatusBadRequest, "请填写标签名称")
		return
	}
	if !validTagIconType(req.IconType) {
		fail(c, http.StatusBadRequest, "图标类型无效")
		return
	}
	name := strings.TrimSpace(req.Name)
	if len([]rune(name)) > 50 {
		fail(c, http.StatusBadRequest, "标签名称过长（最多 50 字）")
		return
	}
	var tag models.Tag
	if err := a.DB.First(&tag, id).Error; err != nil {
		fail(c, http.StatusNotFound, "标签不存在")
		return
	}
	if name != tag.Name {
		var count int64
		a.DB.Model(&models.Tag{}).Where("name = ? AND id <> ?", name, tag.ID).Count(&count)
		if count > 0 {
			fail(c, http.StatusConflict, "同名标签已存在")
			return
		}
	}
	if err := a.DB.Model(&tag).Updates(map[string]any{"name": name, "icon_type": req.IconType, "icon_value": strings.TrimSpace(req.IconValue)}).Error; err != nil {
		fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
		return
	}
	ok(c, tag)
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
		Where("books.is_public = ? AND books.status IN ?", true, publiclyReadableBookStatuses)
	if currentUser(c) == nil {
		base = base.Where("books.login_required = ?", false)
	}

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
	a.attachChapterCounts(books)
	a.attachBookTags(books)
	ok(c, PageResult{Items: books, Total: total, Page: page, PageSize: pageSize})
}

// attachBookTags 手动为一批书籍加载标签（替代 GORM many2many Preload，解耦核心与标签插件）。
// 标签插件禁用或表不存在时不加载（books[i].Tags 保持空），实现「禁用即无标签」。
func (a *App) attachBookTags(books []models.Book) {
	if len(books) == 0 || !a.pluginEnabled(pluginTags) || !a.DB.Migrator().HasTable(&models.BookTag{}) {
		return
	}
	ids := make([]uint, 0, len(books))
	idx := make(map[uint]int, len(books))
	for i := range books {
		books[i].Tags = []models.Tag{}
		ids = append(ids, books[i].ID)
		idx[books[i].ID] = i
	}
	var pairs []models.BookTag
	if a.DB.Where("book_id IN ?", ids).Order("tag_id ASC").Find(&pairs).Error != nil || len(pairs) == 0 {
		return
	}
	tagIDs := make([]uint, 0, len(pairs))
	seen := map[uint]bool{}
	for _, p := range pairs {
		if !seen[p.TagID] {
			seen[p.TagID] = true
			tagIDs = append(tagIDs, p.TagID)
		}
	}
	var tags []models.Tag
	a.DB.Where("id IN ?", tagIDs).Find(&tags)
	tagByID := make(map[uint]models.Tag, len(tags))
	for _, t := range tags {
		tagByID[t.ID] = t
	}
	for _, p := range pairs {
		if t, ok := tagByID[p.TagID]; ok {
			books[idx[p.BookID]].Tags = append(books[idx[p.BookID]].Tags, t)
		}
	}
}

// tagsQueryable 标签插件已启用且表存在时才可对 book_tags/tags 做联表查询。
func (a *App) tagsQueryable() bool {
	return a.pluginEnabled(pluginTags) && a.DB.Migrator().HasTable(&models.BookTag{})
}

// attachBookTagsOne 为单本书加载标签（attachBookTags 的单本封装）。
func (a *App) attachBookTagsOne(book *models.Book) {
	if book == nil {
		return
	}
	one := []models.Book{*book}
	a.attachBookTags(one)
	book.Tags = one[0].Tags
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

// syncBookTags 将书籍标签同步为请求给定的名称列表（find-or-create + 全量替换）。
// 标签插件禁用时直接跳过（不新增/不清空既有关联），与「禁用即前后端全禁」一致。
func (a *App) syncBookTags(book *models.Book, names []string) error {
	if !a.pluginEnabled(pluginTags) {
		return nil
	}
	tags := []models.Tag{}
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
	// 手动全量替换 book_tags 关联（不走 GORM many2many）
	if err := a.DB.Where("book_id = ?", book.ID).Delete(&models.BookTag{}).Error; err != nil {
		return err
	}
	book.Tags = tags
	for _, t := range tags {
		if err := a.DB.Create(&models.BookTag{BookID: book.ID, TagID: t.ID}).Error; err != nil {
			return err
		}
	}
	return nil
}
