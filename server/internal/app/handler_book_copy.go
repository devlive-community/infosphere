package app

import (
	"net/http"
	"strings"
	"time"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

type copyBookRequest struct {
	Title  string `json:"title"`
	Mode   string `json:"mode"`    // full（整本）| custom（自选章节）
	DocIDs []uint `json:"doc_ids"` // custom 模式：有序、要复制的原章节 id（可拖拽重排 / 移除）
}

// CopyBook POST /books/:id/copy 复制书籍元数据 + 选定章节到当前用户名下的新草稿书。
// full：按原结构与顺序复制全部章节；custom：仅复制 doc_ids 指定的章节，顺序即为其在数组中的顺序。
func (a *App) CopyBook(c *gin.Context) {
	src, status := a.findBook(c)
	if src == nil {
		fail(c, status, "书籍不存在")
		return
	}
	u := currentUser(c)
	if !a.canReadBook(u, src) {
		fail(c, http.StatusNotFound, "书籍不存在")
		return
	}
	var req copyBookRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}

	// 源章节（未删除），按原顺序
	var srcDocs []models.Document
	a.DB.Where("book_id = ?", src.ID).Order("sort_order ASC, id ASC").Find(&srcDocs)
	byID := make(map[uint]*models.Document, len(srcDocs))
	for i := range srcDocs {
		byID[srcDocs[i].ID] = &srcDocs[i]
	}

	// 选定要复制的章节（有序）与选中集合（用于父子重映射）
	chosen := make([]*models.Document, 0, len(srcDocs))
	selected := map[uint]bool{}
	if req.Mode == "custom" {
		for _, id := range req.DocIDs {
			if d, ok := byID[id]; ok && !selected[id] {
				chosen = append(chosen, d)
				selected[id] = true
			}
		}
	} else {
		for i := range srcDocs {
			chosen = append(chosen, &srcDocs[i])
			selected[srcDocs[i].ID] = true
		}
	}

	// 元数据（副本始终为私有草稿；其余配置尽量完整复制，含语言/版本/翻译分组、导出与水印设置）
	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = src.Title + " 副本"
	}
	title = truncateText(title, 255)
	newBook := models.Book{
		Title: title, UserID: u.ID, Status: "draft", IsPublic: false,
		Description: src.Description, CoverImage: src.CoverImage,
		LoginRequired: src.LoginRequired,
		OrderCol:      src.OrderCol, OrderDir: src.OrderDir, ChapterPrefix: src.ChapterPrefix,
		ChildStatusFollowParent: src.ChildStatusFollowParent,
		Language:                src.Language, TransGroup: src.TransGroup,
		Version: src.Version, VersionGroup: src.VersionGroup,
		WatermarkEnabled: src.WatermarkEnabled, WatermarkText: src.WatermarkText,
		ExportEnabled: src.ExportEnabled, GuestExportEnabled: src.GuestExportEnabled,
		ExportStyleShared: src.ExportStyleShared, ExportFormats: src.ExportFormats,
	}
	newBook.Slug = a.uniqueBookSlug(slugify(title))
	if newBook.Slug == "" {
		newBook.Slug = a.uniqueBookSlug("book")
	}
	if err := a.DB.Create(&newBook).Error; err != nil {
		fail(c, http.StatusInternalServerError, "复制失败: "+err.Error())
		return
	}

	// 复制标签
	var withTags models.Book
	if a.DB.Preload("Tags").First(&withTags, src.ID).Error == nil && len(withTags.Tags) > 0 {
		names := make([]string, 0, len(withTags.Tags))
		for _, t := range withTags.Tags {
			names = append(names, t.Name)
		}
		_ = a.syncBookTags(&newBook, names)
	}

	// 复制每本书的导出样式设置（PageSize/字号/页边距/页脚等）
	var srcExport models.BookExportSetting
	if a.DB.Where("book_id = ?", src.ID).First(&srcExport).Error == nil {
		copyExport := srcExport
		copyExport.ID = 0
		copyExport.BookID = newBook.ID
		copyExport.CreatedAt = time.Time{}
		copyExport.UpdatedAt = time.Time{}
		_ = a.DB.Create(&copyExport).Error
	}

	// 章节：第一遍建档（记录 原 id -> 新 id），第二遍重建父子关系（父章节须同在选中集合内）
	idMap := make(map[uint]uint, len(chosen))
	for idx, d := range chosen {
		base := d.Slug
		if base == "" {
			base = slugify(d.Title)
		}
		nd := models.Document{
			BookID: newBook.ID, UserID: u.ID, Title: d.Title,
			Slug: a.uniqueDocSlug(newBook.ID, base), Content: d.Content,
			Status: d.Status, SortOrder: idx, AllowComments: d.AllowComments,
		}
		if err := a.DB.Create(&nd).Error; err != nil {
			fail(c, http.StatusInternalServerError, "复制章节失败: "+err.Error())
			return
		}
		idMap[d.ID] = nd.ID
	}
	for _, d := range chosen {
		if d.ParentID != nil && selected[*d.ParentID] {
			a.DB.Model(&models.Document{}).Where("id = ?", idMap[d.ID]).Update("parent_id", idMap[*d.ParentID])
		}
	}

	ok(c, gin.H{"book": newBook, "copied_documents": len(chosen)})
}
