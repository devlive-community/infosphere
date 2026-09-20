package app

import (
	"strconv"
	"strings"

	"infosphere/server/internal/models"
)

// 书籍-标签集成 glue：由核心书籍渲染/保存流程调用（列表、详情、复制、关注、导出等约 19 处），
// 属于「书籍如何呈现标签」的核心书籍服务，保留在 app；标签插件的对外端点已迁至 internal/plugins/tags/。
// 标签插件禁用或表不存在时这些函数为安全空操作，实现「禁用即无标签」。

// attachBookTags 手动为一批书籍加载标签（替代 GORM many2many Preload，解耦核心与标签插件）。
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

// findOrCreateTag 按名称查找或创建标签（slug 冲突时追加后缀）。供 syncBookTags 使用。
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
