package tags

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	"gorm.io/gorm"

	"knowforge/server/internal/models"
	"knowforge/server/internal/plugincore"
	"knowforge/server/internal/plugins"
)

// 书籍-标签集成：经 plugincore 扩展点接入核心书籍流程——
//   - 列表/详情回填 Book.Tags（书籍装饰）；
//   - 创建/更新书籍与 ZIP 导入的 tags 字段（书籍扩展字段）；
//   - 复制书籍时复制标签；/books?tag= 与搜索的标签筛选；统计中的 tag_count；彻底删除书籍时清理关联。
// 插件禁用或表不存在时全部为安全空操作，实现「禁用即无标签」。

const maxBookTags = 10

func init() {
	plugincore.OnDecorateBooks(func(core plugincore.Core, books []*models.Book) {
		(&behavior{core: core}).attachBookTags(books)
	})
	plugincore.RegisterBookField(plugincore.BookField{
		Name: "tags",
		Validate: func(raw json.RawMessage) error {
			_, err := decodeTagNames(raw)
			return err
		},
		Save: func(core plugincore.Core, book *models.Book, raw json.RawMessage) error {
			names, err := decodeTagNames(raw)
			if err != nil {
				return err
			}
			if err := (&behavior{core: core}).syncBookTags(book, names); err != nil {
				return fmt.Errorf("标签关联失败: %w", err)
			}
			return nil
		},
	})
	plugincore.OnBookCopied(func(core plugincore.Core, src, dst *models.Book) error {
		b := &behavior{core: core}
		source := models.Book{ID: src.ID}
		b.attachBookTags([]*models.Book{&source})
		if len(source.Tags) == 0 {
			return nil
		}
		names := make([]string, 0, len(source.Tags))
		for _, t := range source.Tags {
			names = append(names, t.Name)
		}
		return b.syncBookTags(dst, names)
	})
	plugincore.RegisterBookFilter(func(core plugincore.Core, params url.Values, query *gorm.DB, bookIDColumn string) *gorm.DB {
		slug := strings.TrimSpace(params.Get("tag"))
		if slug == "" || !(&behavior{core: core}).queryable() {
			return query
		}
		return query.Where("EXISTS (SELECT 1 FROM book_tags sbt JOIN tags st ON st.id = sbt.tag_id WHERE sbt.book_id = "+bookIDColumn+" AND st.slug = ?)", slug)
	})
	plugincore.RegisterStatsProvider(func(core plugincore.Core, publicOnly bool) map[string]any {
		b := &behavior{core: core}
		var count int64
		if b.queryable() {
			q := core.Gorm().Model(&models.Tag{})
			if publicOnly {
				// 公开统计只计挂在公开可读书籍上的标签
				q = q.Joins("JOIN book_tags bt ON bt.tag_id = tags.id").
					Joins("JOIN books b ON b.id = bt.book_id").
					Where("b.is_public = ? AND b.status IN ?", true, core.PubliclyReadableBookStatuses()).
					Distinct("tags.id")
			}
			q.Count(&count)
		}
		return map[string]any{"tag_count": count}
	})
	plugincore.RegisterBookDataModels(&models.BookTag{})
}

// decodeTagNames 解析 tags 字段：字符串数组；null 视为未提供（不改动）。
func decodeTagNames(raw json.RawMessage) ([]string, error) {
	var names []string
	if err := json.Unmarshal(raw, &names); err != nil {
		return nil, err
	}
	return names, nil
}

// queryable 插件已启用且表存在时才可对 book_tags/tags 做查询。
func (b *behavior) queryable() bool {
	return b.core.PluginEnabled(plugins.KeyTags) && b.core.Gorm().Migrator().HasTable(&models.BookTag{})
}

// attachBookTags 为一批书籍加载标签（手动两段查询，不走 GORM many2many，避免核心 Book 依赖标签表）。
func (b *behavior) attachBookTags(books []*models.Book) {
	if len(books) == 0 || !b.queryable() {
		return
	}
	db := b.core.Gorm()
	ids := make([]uint, 0, len(books))
	idx := make(map[uint][]*models.Book, len(books))
	for _, book := range books {
		book.Tags = []models.Tag{}
		ids = append(ids, book.ID)
		idx[book.ID] = append(idx[book.ID], book)
	}
	var pairs []models.BookTag
	if db.Where("book_id IN ?", ids).Order("tag_id ASC").Find(&pairs).Error != nil || len(pairs) == 0 {
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
	db.Where("id IN ?", tagIDs).Find(&tags)
	tagByID := make(map[uint]models.Tag, len(tags))
	for _, t := range tags {
		tagByID[t.ID] = t
	}
	for _, p := range pairs {
		if t, ok := tagByID[p.TagID]; ok {
			for _, book := range idx[p.BookID] {
				book.Tags = append(book.Tags, t)
			}
		}
	}
}

// syncBookTags 将书籍标签同步为给定的名称列表（find-or-create + 全量替换，最多 10 个）。
// 插件禁用时直接跳过（不新增/不清空既有关联）。
func (b *behavior) syncBookTags(book *models.Book, names []string) error {
	if !b.core.PluginEnabled(plugins.KeyTags) {
		return nil
	}
	db := b.core.Gorm()
	tags := []models.Tag{}
	seen := map[string]bool{}
	for _, raw := range names {
		name := strings.TrimSpace(raw)
		if name == "" || seen[name] || len(seen) >= maxBookTags {
			continue
		}
		seen[name] = true
		tag, err := b.findOrCreateTag(name)
		if err != nil {
			return err
		}
		tags = append(tags, *tag)
	}
	if err := db.Where("book_id = ?", book.ID).Delete(&models.BookTag{}).Error; err != nil {
		return err
	}
	book.Tags = tags
	for _, t := range tags {
		if err := db.Create(&models.BookTag{BookID: book.ID, TagID: t.ID}).Error; err != nil {
			return err
		}
	}
	return nil
}
