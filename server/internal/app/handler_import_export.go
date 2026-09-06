package app

import (
	"archive/zip"
	"bytes"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"infosphere/server/internal/config"
	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

// M16 导入导出（portability）：
//   - 导出：zip = book.md front-matter + chapters/<序号>-<slug>.md + images/（本地上传图片随包携带，外链保持 URL）
//   - 导入：解析同一结构还原书籍/章节树/标签/图片，slug 冲突自动重生成
//   - 验收标准：导出再导入内容无损

var uploadRefPattern = regexp.MustCompile(`(?:https?://[^)\s"\]]+)?/uploads/([A-Za-z0-9._\-]+\.(?:png|jpe?g|gif|webp|svg|ico))`)

var importImageRefPattern = regexp.MustCompile(`images/([A-Za-z0-9._\-]+\.(?:png|jpe?g|gif|webp|svg|ico))`)

const (
	importMaxEntries    = 500
	importMaxTotalBytes = 64 << 20 // zip 解压后总量上限
)

func uploadsDir() string {
	return filepath.Join(config.DataDir(), "uploads")
}

// rewriteUploadsToLocal 把正文/封面中的本站 /uploads 引用改写为包内 images/ 相对路径；
// 仅当文件真实存在于上传目录时改写，保证往返一致
func (a *App) rewriteUploadsToLocal(content string) (string, map[string][]byte) {
	files := map[string][]byte{}
	dir := uploadsDir()
	out := uploadRefPattern.ReplaceAllStringFunc(content, func(match string) string {
		name := uploadRefPattern.FindStringSubmatch(match)[1]
		if _, done := files[name]; done {
			return "images/" + name
		}
		data, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			return match // 本地不存在（外链或已删除），保持原样
		}
		files[name] = data
		return "images/" + name
	})
	return out, files
}

// ExportBook GET /books/:id/export?format=markdown 导出书籍为 zip
func (a *App) ExportBook(c *gin.Context) {
	book, status := a.findBook(c)
	if book == nil {
		fail(c, status, "书籍不存在")
		return
	}
	if !a.canEditBookContent(currentUser(c), book) {
		fail(c, http.StatusForbidden, "无权导出该书籍")
		return
	}

	buf := &bytes.Buffer{}
	w := zip.NewWriter(buf)

	// 1. book.md front-matter
	cover, coverFiles := a.rewriteUploadsToLocal(book.CoverImage)
	bookFields := &orderedFields{}
	bookFields.
		set("title", book.Title).
		set("description", book.Description).
		set("slug", book.Slug).
		set("status", book.Status).
		set("is_public", strconv.FormatBool(book.IsPublic)).
		set("order_col", book.OrderCol).
		set("order_dir", book.OrderDir).
		set("chapter_prefix", book.ChapterPrefix).
		set("cover_image", cover)
	tagNames := []string{}
	for _, t := range book.Tags {
		tagNames = append(tagNames, t.Name)
	}
	if err := writeMarkdown(w, "book.md", bookFields, map[string][]string{"tags": tagNames}, ""); err != nil {
		fail(c, http.StatusInternalServerError, "打包失败: "+err.Error())
		return
	}
	images := coverFiles

	// 2. 章节（按 sort_order 稳定排序后带编号，便于人工阅读）
	docs := []models.Document{}
	if err := a.DB.Where("book_id = ?", book.ID).Order("sort_order ASC, id ASC").Find(&docs).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询章节失败")
		return
	}
	for i, doc := range docs {
		content, docImages := a.rewriteUploadsToLocal(doc.Content)
		for name, data := range docImages {
			images[name] = data
		}
		fields := &orderedFields{}
		fields.
			set("title", doc.Title).
			set("slug", doc.Slug).
			set("sort_order", strconv.Itoa(doc.SortOrder)).
			set("status", doc.Status)
		if doc.ParentID != nil {
			for _, p := range docs {
				if p.ID == *doc.ParentID {
					fields.set("parent", p.Slug)
					break
				}
			}
		}
		if doc.AllowComments != nil {
			fields.set("allow_comments", strconv.FormatBool(*doc.AllowComments))
		}
		name := doc.Slug
		if name == "" {
			name = fmt.Sprintf("doc-%d", doc.ID)
		}
		filename := fmt.Sprintf("chapters/%02d-%s.md", i+1, name)
		if err := writeMarkdown(w, filename, fields, nil, content); err != nil {
			fail(c, http.StatusInternalServerError, "打包失败: "+err.Error())
			return
		}
	}

	// 3. images/
	for name, data := range images {
		f, err := w.Create("images/" + name)
		if err != nil {
			fail(c, http.StatusInternalServerError, "打包失败: "+err.Error())
			return
		}
		if _, err := f.Write(data); err != nil {
			fail(c, http.StatusInternalServerError, "打包失败: "+err.Error())
			return
		}
	}

	if err := w.Close(); err != nil {
		fail(c, http.StatusInternalServerError, "打包失败: "+err.Error())
		return
	}

	filename := book.Slug
	if filename == "" {
		filename = fmt.Sprintf("book-%d", book.ID)
	}
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s.zip", filename))
	c.Data(http.StatusOK, "application/zip", buf.Bytes())
}

// orderedFields 保序 front-matter 字段，输出格式稳定
type orderedFields struct {
	keys   []string
	values map[string]string
}

func (f *orderedFields) set(key, value string) *orderedFields {
	if f.values == nil {
		f.values = map[string]string{}
	}
	if _, exists := f.values[key]; !exists {
		f.keys = append(f.keys, key)
	}
	f.values[key] = value
	return f
}

func (f *orderedFields) get(key string) string {
	return f.values[key]
}

// orderedListKeys 固定列表字段的输出顺序
var orderedListKeys = []string{"tags"}

func isBareValue(v string) bool {
	switch v {
	case "true", "false":
		return true
	}
	if _, err := strconv.Atoi(v); err == nil {
		return true
	}
	return false
}

// writeMarkdown 写入 front-matter + 正文；字符串经 strconv.Quote 转义，往返无损
func writeMarkdown(w *zip.Writer, name string, fields *orderedFields, lists map[string][]string, body string) error {
	f, err := w.Create(name)
	if err != nil {
		return err
	}
	var b strings.Builder
	b.WriteString("---\n")
	for _, k := range fields.keys {
		v := fields.get(k)
		if isBareValue(v) {
			b.WriteString(k + ": " + v + "\n")
		} else {
			b.WriteString(k + ": " + strconv.Quote(v) + "\n")
		}
	}
	for _, k := range orderedListKeys {
		if items := lists[k]; len(items) > 0 {
			b.WriteString(k + ": [" + strings.Join(items, ", ") + "]\n")
		}
	}
	b.WriteString("---\n")
	b.WriteString(body)
	_, err = f.Write([]byte(b.String()))
	return err
}

// parseFrontMatter 解析本包产出的 front-matter（key: value / key: [a, b]），
// 返回字段、列表字段与正文；缺字段由导入逻辑兜底
func parseFrontMatter(content string) (*orderedFields, map[string][]string, string) {
	fields := &orderedFields{values: map[string]string{}}
	lists := map[string][]string{}
	body := content
	if strings.HasPrefix(content, "---\n") {
		rest := content[4:]
		if idx := strings.Index(rest, "\n---\n"); idx >= 0 {
			header := rest[:idx]
			body = rest[idx+5:]
			for _, line := range strings.Split(header, "\n") {
				line = strings.TrimSpace(line)
				if line == "" || strings.HasPrefix(line, "#") {
					continue
				}
				colon := strings.Index(line, ":")
				if colon <= 0 {
					continue
				}
				key := strings.TrimSpace(line[:colon])
				value := strings.TrimSpace(line[colon+1:])
				if strings.HasPrefix(value, "[") && strings.HasSuffix(value, "]") {
					inner := value[1 : len(value)-1]
					items := []string{}
					for _, part := range strings.Split(inner, ",") {
						part = strings.TrimSpace(part)
						if part == "" {
							continue
						}
						items = append(items, unquoteValue(part))
					}
					lists[key] = items
					continue
				}
				if !containsKey(fields, key) {
					fields.keys = append(fields.keys, key)
				}
				fields.values[key] = unquoteValue(value)
			}
		}
	}
	return fields, lists, body
}

func containsKey(f *orderedFields, key string) bool {
	for _, k := range f.keys {
		if k == key {
			return true
		}
	}
	return false
}

func unquoteValue(v string) string {
	if len(v) >= 2 && v[0] == '"' && v[len(v)-1] == '"' {
		if unquoted, err := strconv.Unquote(v); err == nil {
			return unquoted
		}
		return v[1 : len(v)-1]
	}
	return v
}

// ImportBook POST /import 上传 zip 还原书籍（成为当前用户的书籍）
func (a *App) ImportBook(c *gin.Context) {
	u := currentUser(c)
	header, err := c.FormFile("file")
	if err != nil {
		fail(c, http.StatusBadRequest, "请选择要导入的 zip 文件")
		return
	}
	if header.Size > importMaxTotalBytes {
		fail(c, http.StatusBadRequest, "文件不能超过 64MB")
		return
	}
	f, err := header.Open()
	if err != nil {
		fail(c, http.StatusBadRequest, "读取文件失败")
		return
	}
	defer f.Close()
	reader, err := zip.NewReader(f, header.Size)
	if err != nil {
		fail(c, http.StatusBadRequest, "无法解析 zip 文件")
		return
	}

	// ── 读取 zip 内容并做路径与体量安全校验 ──
	entries := map[string][]byte{}
	total := 0
	if len(reader.File) > importMaxEntries {
		fail(c, http.StatusBadRequest, "zip 内文件数量过多")
		return
	}
	for _, entry := range reader.File {
		name := filepath.ToSlash(entry.Name)
		if strings.HasPrefix(name, "/") || strings.Contains(name, "..") {
			fail(c, http.StatusBadRequest, "zip 内存在非法路径: "+name)
			return
		}
		if entry.FileInfo().IsDir() {
			continue
		}
		data, err := readZipEntry(entry)
		if err != nil {
			fail(c, http.StatusBadRequest, fmt.Sprintf("读取 %s 失败: %v", name, err))
			return
		}
		total += len(data)
		if total > importMaxTotalBytes {
			fail(c, http.StatusBadRequest, "zip 解压后体量过大")
			return
		}
		entries[name] = data
	}

	bookData, found := entries["book.md"]
	if !found {
		fail(c, http.StatusBadRequest, "zip 缺少 book.md")
		return
	}
	bookFields, lists, _ := parseFrontMatter(string(bookData))
	title := bookFields.get("title")
	if title == "" {
		fail(c, http.StatusBadRequest, "book.md 缺少 title")
		return
	}

	// ── 建书（slug 冲突自动重生成）──
	status := bookFields.get("status")
	if !bookStatuses[status] {
		status = "draft"
	}
	book := models.Book{
		Title:         title,
		Description:   bookFields.get("description"),
		Slug:          slugify(bookFields.get("slug")),
		UserID:        u.ID,
		Status:        status,
		IsPublic:      bookFields.get("is_public") == "true",
		OrderCol:      bookFields.get("order_col"),
		OrderDir:      strings.ToLower(bookFields.get("order_dir")),
		ChapterPrefix: bookFields.get("chapter_prefix"),
	}
	if !allowedOrderCols[book.OrderCol] {
		book.OrderCol = "created_at"
	}
	if book.OrderDir != "asc" && book.OrderDir != "desc" {
		book.OrderDir = "desc"
	}
	if book.Slug == "" {
		book.Slug = slugify(title)
	}
	book.Slug = a.uniqueBookSlug(book.Slug)
	book.CoverImage = a.importImages(bookFields.get("cover_image"), entries)
	if err := a.DB.Create(&book).Error; err != nil {
		fail(c, http.StatusInternalServerError, "创建书籍失败: "+err.Error())
		return
	}
	if tags := lists["tags"]; len(tags) > 0 {
		a.syncBookTags(&book, tags)
	}

	// ── 章节：两轮创建（先建全部，再按 slug 挂 parent）──
	type pendingDoc struct {
		doc    models.Document
		parent string
	}
	var pendings []pendingDoc
	for name, data := range entries {
		if !strings.HasPrefix(name, "chapters/") || !strings.HasSuffix(name, ".md") {
			continue
		}
		fields, _, content := parseFrontMatter(string(data))
		docTitle := fields.get("title")
		if docTitle == "" {
			docTitle = strings.TrimSuffix(filepath.Base(name), ".md")
		}
		docSlug := slugify(fields.get("slug"))
		if docSlug == "" {
			docSlug = a.uniqueDocSlug(book.ID, slugify(docTitle))
		}
		docStatus := fields.get("status")
		if docStatus != "published" && docStatus != "archived" {
			docStatus = "draft"
		}
		sortOrder := 0
		if n, err := strconv.Atoi(fields.get("sort_order")); err == nil {
			sortOrder = n
		}
		doc := models.Document{
			BookID: book.ID, Title: docTitle, Slug: docSlug,
			Content: a.importImages(content, entries),
			UserID:  u.ID, SortOrder: sortOrder, Status: docStatus,
		}
		if raw := fields.get("allow_comments"); raw != "" {
			allow := raw == "true"
			doc.AllowComments = &allow
		}
		pendings = append(pendings, pendingDoc{doc: doc, parent: fields.get("parent")})
	}

	created := map[string]uint{}
	for i := range pendings {
		// 同一包内 slug 重复时补后缀
		for {
			var count int64
			a.DB.Model(&models.Document{}).Where("book_id = ? AND slug = ?", book.ID, pendings[i].doc.Slug).Count(&count)
			_, seen := created[pendings[i].doc.Slug]
			if count == 0 && !seen {
				break
			}
			pendings[i].doc.Slug += "-x"
		}
		if err := a.DB.Create(&pendings[i].doc).Error; err != nil {
			fail(c, http.StatusInternalServerError, "创建章节失败: "+err.Error())
			return
		}
		created[pendings[i].doc.Slug] = pendings[i].doc.ID
	}
	for _, p := range pendings {
		if p.parent == "" {
			continue
		}
		if parentID, parentOK := created[p.parent]; parentOK {
			a.DB.Model(&models.Document{}).Where("id = ?", p.doc.ID).Update("parent_id", parentID)
		}
	}

	ok(c, gin.H{
		"book":         book,
		"imported_doc": len(created),
		"message":      fmt.Sprintf("导入完成：《%s》共 %d 个章节", book.Title, len(created)),
	})
}

// importImages 把包内 images/ 引用还原为 /uploads/，文件写入上传目录；返回改写后的内容
func (a *App) importImages(content string, entries map[string][]byte) string {
	return importImageRefPattern.ReplaceAllStringFunc(content, func(match string) string {
		name := strings.TrimPrefix(match, "images/")
		data, exists := entries["images/"+name]
		if !exists {
			return match
		}
		if err := os.MkdirAll(uploadsDir(), uploadDirPermissions); err != nil {
			return match
		}
		dst := filepath.Join(uploadsDir(), filepath.Base(name))
		if _, err := os.Stat(dst); os.IsNotExist(err) {
			if err := os.WriteFile(dst, data, 0o644); err != nil {
				return match
			}
		}
		return "/uploads/" + filepath.Base(name)
	})
}

// uniqueBookSlug 生成未占用的书籍 slug
func (a *App) uniqueBookSlug(base string) string {
	candidate := base
	for i := 1; ; i++ {
		var count int64
		a.DB.Model(&models.Book{}).Where("slug = ?", candidate).Count(&count)
		if count == 0 {
			return candidate
		}
		candidate = fmt.Sprintf("%s-imported-%d", base, i)
	}
}

// uniqueDocSlug 生成书籍内未占用的章节 slug
func (a *App) uniqueDocSlug(bookID uint, base string) string {
	candidate := base
	for i := 1; ; i++ {
		var count int64
		a.DB.Model(&models.Document{}).Where("book_id = ? AND slug = ?", bookID, candidate).Count(&count)
		if count == 0 {
			return candidate
		}
		candidate = fmt.Sprintf("%s-%d", base, i)
	}
}

func readZipEntry(entry *zip.File) ([]byte, error) {
	rc, err := entry.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	buf := &bytes.Buffer{}
	if _, err := buf.ReadFrom(rc); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

const uploadDirPermissions = 0o755
