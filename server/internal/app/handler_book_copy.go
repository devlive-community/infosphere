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
	Slug   string `json:"slug"`    // 可选：显式设置副本访问路径；设置后不可再改，留空则自动生成且允许改一次
	Mode   string `json:"mode"`    // full（整本）| custom（自选章节）| metadata（仅元数据，不含章节）
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
	} else if req.Mode == "metadata" {
		// 仅复制元数据，不含任何章节：chosen 保持为空
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
	// 访问路径：显式设置则校验唯一并锁定（SlugEditable=false）；留空则自动生成且允许改一次
	slug := strings.TrimSpace(req.Slug)
	slugEditable := true
	if slug != "" {
		if !validSlug(slug) {
			fail(c, http.StatusBadRequest, "访问路径仅支持小写字母、数字与中划线")
			return
		}
		var taken int64
		a.DB.Model(&models.Book{}).Where("slug = ?", slug).Count(&taken)
		if taken > 0 {
			fail(c, http.StatusConflict, "访问路径已被占用")
			return
		}
		slugEditable = false
	} else {
		slug = a.uniqueBookSlug(slugify(title))
		if slug == "" {
			slug = a.uniqueBookSlug("book")
		}
	}
	newBook := models.Book{
		Title: title, UserID: u.ID, Status: "draft", IsPublic: false, Slug: slug,
		SlugEditable:  slugEditable,
		Description:   src.Description, CoverImage: src.CoverImage,
		LoginRequired: src.LoginRequired,
		OrderCol:      src.OrderCol, OrderDir: src.OrderDir, ChapterPrefix: src.ChapterPrefix,
		ChildStatusFollowParent: src.ChildStatusFollowParent,
		Language:                src.Language, TransGroup: src.TransGroup,
		Version: src.Version, VersionGroup: src.VersionGroup,
		WatermarkEnabled: src.WatermarkEnabled, WatermarkText: src.WatermarkText,
		ExportEnabled: src.ExportEnabled, GuestExportEnabled: src.GuestExportEnabled,
		ExportStyleShared: src.ExportStyleShared, ExportFormats: src.ExportFormats,
	}
	if err := a.DB.Create(&newBook).Error; err != nil {
		fail(c, http.StatusInternalServerError, "复制失败: "+err.Error())
		return
	}

	// 复制标签（手动加载源书标签名，标签插件禁用时为空）
	withTags := models.Book{ID: src.ID}
	a.attachBookTagsOne(&withTags)
	if len(withTags.Tags) > 0 {
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
	firstDocSlug := ""
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
		if idx == 0 {
			firstDocSlug = nd.Slug // 首个章节，供前端复制后直接进入写作台该章节
		}
		idMap[d.ID] = nd.ID
	}
	for _, d := range chosen {
		if d.ParentID != nil && selected[*d.ParentID] {
			a.DB.Model(&models.Document{}).Where("id = ?", idMap[d.ID]).Update("parent_id", idMap[*d.ParentID])
		}
	}

	ok(c, gin.H{"book": newBook, "copied_documents": len(chosen), "first_doc_slug": firstDocSlug})
}

type copyDocumentsRequest struct {
	TargetBookID uint   `json:"target_book_id"`
	DocIDs       []uint `json:"doc_ids"`
}

// CopyDocuments POST /books/:id/documents/copy 将选定章节（含各自子章节树）复制到目标书籍，保持目录结构。
// 选中父章节即连同其子树一并复制；顶层（父不在复制集合内）追加到目标书籍目录末尾。
func (a *App) CopyDocuments(c *gin.Context) {
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
	var req copyDocumentsRequest
	if err := c.ShouldBindJSON(&req); err != nil || len(req.DocIDs) == 0 || req.TargetBookID == 0 {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	var target models.Book
	if err := a.DB.First(&target, req.TargetBookID).Error; err != nil {
		fail(c, http.StatusNotFound, "目标书籍不存在")
		return
	}
	if !a.canEditBookContent(u, &target) {
		fail(c, http.StatusForbidden, "无权写入目标书籍")
		return
	}

	// 源书全部章节，建父->有序子节点映射
	var srcDocs []models.Document
	a.DB.Where("book_id = ?", src.ID).Order("sort_order ASC, id ASC").Find(&srcDocs)
	byID := make(map[uint]*models.Document, len(srcDocs))
	children := make(map[uint][]*models.Document)
	for i := range srcDocs {
		d := &srcDocs[i]
		byID[d.ID] = d
		pid := uint(0)
		if d.ParentID != nil {
			pid = *d.ParentID
		}
		children[pid] = append(children[pid], d)
	}

	// 展开选中集合为「选中节点 + 各自子树」，按源顺序前序遍历并去重
	copySet := map[uint]bool{}
	ordered := make([]*models.Document, 0, len(srcDocs))
	var addSubtree func(d *models.Document)
	addSubtree = func(d *models.Document) {
		if copySet[d.ID] {
			return
		}
		copySet[d.ID] = true
		ordered = append(ordered, d)
		for _, ch := range children[d.ID] {
			addSubtree(ch)
		}
	}
	for _, id := range req.DocIDs {
		if d, ok := byID[id]; ok {
			addSubtree(d)
		}
	}
	if len(ordered) == 0 {
		fail(c, http.StatusBadRequest, "没有可复制的章节")
		return
	}

	// 目标书顶层现有数量，作为追加起始 sort_order
	var topCount int64
	a.DB.Model(&models.Document{}).Where("book_id = ? AND parent_id IS NULL", target.ID).Count(&topCount)
	nextTop := int(topCount)

	// 两遍：先建档记录 原 id -> 新 id，再重建父子（父在复制集合内映射，否则置为目标书顶层）
	idMap := make(map[uint]uint, len(ordered))
	for _, d := range ordered {
		base := d.Slug
		if base == "" {
			base = slugify(d.Title)
		}
		nd := models.Document{
			BookID: target.ID, UserID: u.ID, Title: d.Title,
			Slug: a.uniqueDocSlug(target.ID, base), Content: d.Content,
			Status: d.Status, AllowComments: d.AllowComments,
		}
		if d.ParentID == nil || !copySet[*d.ParentID] {
			nd.SortOrder = nextTop
			nextTop++
		} else {
			nd.SortOrder = d.SortOrder
		}
		if err := a.DB.Create(&nd).Error; err != nil {
			fail(c, http.StatusInternalServerError, "复制章节失败: "+err.Error())
			return
		}
		idMap[d.ID] = nd.ID
	}
	for _, d := range ordered {
		if d.ParentID != nil && copySet[*d.ParentID] {
			a.DB.Model(&models.Document{}).Where("id = ?", idMap[d.ID]).Update("parent_id", idMap[*d.ParentID])
		}
	}

	a.recordAudit(c, "document.copied", "book", strings.TrimSpace(target.Slug), "复制章节到书籍", map[string]any{
		"source_book_id": src.ID, "target_book_id": target.ID, "copied": len(ordered),
	})
	ok(c, gin.H{"copied_documents": len(ordered), "target_book_id": target.ID, "target_slug": target.Slug})
}
