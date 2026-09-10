package app

import (
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type searchResult struct {
	Books         []models.Book     `json:"books"`
	Documents     []searchDocResult `json:"documents"`
	BookTotal     int64             `json:"book_total"`
	DocumentTotal int64             `json:"document_total"`
	Total         int64             `json:"total"`
	Page          int               `json:"page"`
	PageSize      int               `json:"page_size"`
}

type searchDocResult struct {
	ID        uint      `json:"id"`
	BookID    uint      `json:"book_id"`
	BookSlug  string    `json:"book_slug"`
	BookTitle string    `json:"book_title"`
	DocSlug   string    `json:"doc_slug"`
	Title     string    `json:"title"`
	Excerpt   string    `json:"excerpt"`
	UpdatedAt time.Time `json:"updated_at"`
}

type searchOptions struct {
	Query       string
	Type        string
	Author      string
	Tag         string
	UpdatedFrom *time.Time
	UpdatedTo   *time.Time
	Page        int
	PageSize    int
}

var markdownSearchSyntax = regexp.MustCompile("(?m)^(#{1,6}|>|[-+*]|\\d+\\.)\\s+|```|`|!\\[([^]]*)\\]\\([^)]*\\)|\\[([^]]+)\\]\\([^)]*\\)|[*_~]")

// GlobalSearch GET /search 高级全文搜索。全文索引只负责召回，所有结果仍经过
// 当前用户的书籍与章节可见性条件，避免索引绕过权限边界。
func (a *App) GlobalSearch(c *gin.Context) {
	options, errMessage := parseSearchOptions(c)
	if errMessage != "" {
		fail(c, http.StatusBadRequest, errMessage)
		return
	}
	empty := searchResult{Books: []models.Book{}, Documents: []searchDocResult{}, Page: options.Page, PageSize: options.PageSize}
	if options.Query == "" {
		ok(c, empty)
		return
	}

	books, bookTotal, err := a.searchBooks(c, options)
	if err != nil {
		fail(c, http.StatusInternalServerError, "搜索失败")
		return
	}
	documents, documentTotal, err := a.searchDocuments(c, options)
	if err != nil {
		fail(c, http.StatusInternalServerError, "搜索失败")
		return
	}

	if options.Type == "all" {
		books, documents = paginateMixedSearch(books, documents, options.Page, options.PageSize)
	}
	a.attachChapterCounts(books)
	visibleTotal := bookTotal + documentTotal
	if options.Type == "book" {
		visibleTotal = bookTotal
	} else if options.Type == "document" {
		visibleTotal = documentTotal
	}
	ok(c, searchResult{
		Books: books, Documents: documents, BookTotal: bookTotal, DocumentTotal: documentTotal,
		Total: visibleTotal, Page: options.Page, PageSize: options.PageSize,
	})
}

func parseSearchOptions(c *gin.Context) (searchOptions, string) {
	page, pageSize := paginate(c)
	options := searchOptions{
		Query: strings.TrimSpace(c.Query("q")), Type: strings.TrimSpace(c.DefaultQuery("type", "all")),
		Author: strings.TrimSpace(c.Query("author")), Tag: strings.TrimSpace(c.Query("tag")), Page: page, PageSize: pageSize,
	}
	if utf8.RuneCountInString(options.Query) > 100 {
		return options, "搜索关键词最多 100 个字符"
	}
	if options.Type != "all" && options.Type != "book" && options.Type != "document" {
		return options, "搜索类型必须是 all、book 或 document"
	}
	if options.Author != "" && !usernameRegex.MatchString(options.Author) {
		return options, "作者用户名格式不正确"
	}
	if options.Tag != "" && len(options.Tag) > 50 {
		return options, "标签参数过长"
	}
	if value := strings.TrimSpace(c.Query("updated_from")); value != "" {
		parsed, err := time.ParseInLocation("2006-01-02", value, time.Local)
		if err != nil {
			return options, "开始日期格式应为 YYYY-MM-DD"
		}
		options.UpdatedFrom = &parsed
	}
	if value := strings.TrimSpace(c.Query("updated_to")); value != "" {
		parsed, err := time.ParseInLocation("2006-01-02", value, time.Local)
		if err != nil {
			return options, "结束日期格式应为 YYYY-MM-DD"
		}
		parsed = parsed.AddDate(0, 0, 1)
		options.UpdatedTo = &parsed
	}
	if options.UpdatedFrom != nil && options.UpdatedTo != nil && !options.UpdatedFrom.Before(*options.UpdatedTo) {
		return options, "开始日期不能晚于结束日期"
	}
	return options, ""
}

func (a *App) searchBooks(c *gin.Context, options searchOptions) ([]models.Book, int64, error) {
	var total int64
	if err := a.bookSearchQuery(c, options).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if options.Type == "document" {
		return []models.Book{}, total, nil
	}
	limit, offset := options.PageSize, (options.Page-1)*options.PageSize
	if options.Type == "all" {
		limit, offset = options.Page*options.PageSize, 0
	}
	books := []models.Book{}
	if err := preloadBookUser(a.bookSearchQuery(c, options)).
		Order("books.updated_at DESC").Limit(limit).Offset(offset).Find(&books).Error; err != nil {
		return nil, 0, err
	}
	return books, total, nil
}

func (a *App) bookSearchQuery(c *gin.Context, options searchOptions) *gorm.DB {
	query := a.applyBookSearchMatch(a.DB.Model(&models.Book{}), options.Query)
	if u := currentUser(c); u != nil {
		if !IsAdmin(u) {
			query = query.Where(
				"((books.is_public = ? AND books.status IN ?) OR books.user_id = ? OR EXISTS (SELECT 1 FROM book_collaborators bc WHERE bc.book_id = books.id AND bc.user_id = ? AND bc.status = 'accepted'))",
				true, publiclyReadableBookStatuses, u.ID, u.ID,
			)
		}
	} else {
		// 未登录游客看不到「仅登录可读」书籍
		query = query.Where("books.is_public = ? AND books.status IN ? AND books.login_required = ?", true, publiclyReadableBookStatuses, false)
	}
	if options.Author != "" {
		query = query.Where("EXISTS (SELECT 1 FROM users su WHERE su.id = books.user_id AND su.username = ?)", options.Author)
	}
	if options.Tag != "" {
		query = query.Where("EXISTS (SELECT 1 FROM book_tags sbt JOIN tags st ON st.id = sbt.tag_id WHERE sbt.book_id = books.id AND st.slug = ?)", options.Tag)
	}
	if options.UpdatedFrom != nil {
		query = query.Where("books.updated_at >= ?", *options.UpdatedFrom)
	}
	if options.UpdatedTo != nil {
		query = query.Where("books.updated_at < ?", *options.UpdatedTo)
	}
	return query
}

func (a *App) applyBookSearchMatch(query *gorm.DB, q string) *gorm.DB {
	switch a.search {
	case searchBackendSQLite:
		if expression := sqliteFTSQuery(q); expression != "" {
			return query.Where("books.id IN (SELECT rowid FROM books_search_fts WHERE books_search_fts MATCH ?)", expression)
		}
	case searchBackendMySQL:
		if mysqlFullTextSuitable(q) {
			return query.Where("MATCH(books.title, books.description) AGAINST (? IN NATURAL LANGUAGE MODE)", q)
		}
	case searchBackendPostgres:
		if asciiSearch(q) {
			return query.Where("to_tsvector('simple', coalesce(books.title, '') || ' ' || coalesce(books.description, '')) @@ plainto_tsquery('simple', ?)", q)
		}
	}
	like := "%" + escapeLike(q) + "%"
	return query.Where("(books.title LIKE ? ESCAPE '!' OR books.description LIKE ? ESCAPE '!')", like, like)
}

func (a *App) searchDocuments(c *gin.Context, options searchOptions) ([]searchDocResult, int64, error) {
	var total int64
	if err := a.documentSearchQuery(c, options).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if options.Type == "book" {
		return []searchDocResult{}, total, nil
	}
	limit, offset := options.PageSize, (options.Page-1)*options.PageSize
	if options.Type == "all" {
		limit, offset = options.Page*options.PageSize, 0
	}
	type documentRow struct {
		models.Document
		BookSlug  string `gorm:"column:book_slug"`
		BookTitle string `gorm:"column:book_title"`
	}
	rows := []documentRow{}
	if err := a.documentSearchQuery(c, options).
		Select("documents.*, b.slug AS book_slug, b.title AS book_title").
		Order("documents.updated_at DESC").Limit(limit).Offset(offset).Scan(&rows).Error; err != nil {
		return nil, 0, err
	}
	results := make([]searchDocResult, 0, len(rows))
	for _, row := range rows {
		results = append(results, searchDocResult{
			ID: row.ID, BookID: row.BookID, BookSlug: row.BookSlug, BookTitle: row.BookTitle,
			DocSlug: row.Slug, Title: row.Title, Excerpt: searchExcerpt(row.Content, options.Query, 160), UpdatedAt: row.UpdatedAt,
		})
	}
	return results, total, nil
}

func (a *App) documentSearchQuery(c *gin.Context, options searchOptions) *gorm.DB {
	query := a.applyDocumentSearchMatch(a.DB.Model(&models.Document{}).Joins("JOIN books b ON b.id = documents.book_id"), options.Query)
	if u := currentUser(c); u != nil {
		if !IsAdmin(u) {
			query = query.Where(`(
				(b.is_public = ? AND b.status IN ? AND documents.status = ?)
				OR b.user_id = ?
				OR EXISTS (SELECT 1 FROM book_collaborators bc WHERE bc.book_id = b.id AND bc.user_id = ? AND bc.role = 'editor' AND bc.status = 'accepted')
				OR (documents.status = ? AND EXISTS (SELECT 1 FROM book_collaborators bc WHERE bc.book_id = b.id AND bc.user_id = ? AND bc.role = 'viewer' AND bc.status = 'accepted'))
			)`,
				true, publiclyReadableBookStatuses, "published", u.ID, u.ID, "published", u.ID,
			)
		}
	} else {
		// 未登录游客看不到「仅登录可读」书籍
		query = query.Where("b.is_public = ? AND b.status IN ? AND documents.status = ? AND b.login_required = ?", true, publiclyReadableBookStatuses, "published", false)
	}
	if options.Author != "" {
		query = query.Where("EXISTS (SELECT 1 FROM users su WHERE su.id = b.user_id AND su.username = ?)", options.Author)
	}
	if options.Tag != "" {
		query = query.Where("EXISTS (SELECT 1 FROM book_tags sbt JOIN tags st ON st.id = sbt.tag_id WHERE sbt.book_id = b.id AND st.slug = ?)", options.Tag)
	}
	if options.UpdatedFrom != nil {
		query = query.Where("documents.updated_at >= ?", *options.UpdatedFrom)
	}
	if options.UpdatedTo != nil {
		query = query.Where("documents.updated_at < ?", *options.UpdatedTo)
	}
	return query
}

func (a *App) applyDocumentSearchMatch(query *gorm.DB, q string) *gorm.DB {
	switch a.search {
	case searchBackendSQLite:
		if expression := sqliteFTSQuery(q); expression != "" {
			return query.Where("documents.id IN (SELECT rowid FROM documents_search_fts WHERE documents_search_fts MATCH ?)", expression)
		}
	case searchBackendMySQL:
		if mysqlFullTextSuitable(q) {
			return query.Where("MATCH(documents.title, documents.content) AGAINST (? IN NATURAL LANGUAGE MODE)", q)
		}
	case searchBackendPostgres:
		if asciiSearch(q) {
			return query.Where("to_tsvector('simple', coalesce(documents.title, '') || ' ' || coalesce(documents.content, '')) @@ plainto_tsquery('simple', ?)", q)
		}
	}
	like := "%" + escapeLike(q) + "%"
	return query.Where("(documents.title LIKE ? ESCAPE '!' OR documents.content LIKE ? ESCAPE '!')", like, like)
}

func escapeLike(value string) string {
	value = strings.ReplaceAll(value, `!`, `!!`)
	value = strings.ReplaceAll(value, `%`, `!%`)
	return strings.ReplaceAll(value, `_`, `!_`)
}

func asciiSearch(value string) bool {
	for _, r := range value {
		if r > 127 {
			return false
		}
	}
	return true
}

func mysqlFullTextSuitable(value string) bool {
	if !asciiSearch(value) {
		return false
	}
	for _, part := range strings.Fields(value) {
		if len([]rune(part)) < 4 {
			return false
		}
	}
	return true
}

func searchExcerpt(markdown, q string, max int) string {
	text := markdownSearchSyntax.ReplaceAllString(markdown, "$2$3")
	text = strings.Join(strings.Fields(text), " ")
	runes := []rune(text)
	if len(runes) <= max {
		return text
	}
	byteIndex := strings.Index(strings.ToLower(text), strings.ToLower(q))
	center := 0
	if byteIndex >= 0 {
		center = utf8.RuneCountInString(text[:byteIndex])
	}
	start := center - max/3
	if start < 0 {
		start = 0
	}
	end := start + max
	if end > len(runes) {
		end = len(runes)
		start = end - max
	}
	prefix, suffix := "", ""
	if start > 0 {
		prefix = "…"
	}
	if end < len(runes) {
		suffix = "…"
	}
	return prefix + string(runes[start:end]) + suffix
}

func paginateMixedSearch(books []models.Book, documents []searchDocResult, page, pageSize int) ([]models.Book, []searchDocResult) {
	type item struct {
		book *models.Book
		doc  *searchDocResult
		at   time.Time
	}
	items := make([]item, 0, len(books)+len(documents))
	for i := range books {
		items = append(items, item{book: &books[i], at: books[i].UpdatedAt})
	}
	for i := range documents {
		items = append(items, item{doc: &documents[i], at: documents[i].UpdatedAt})
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].at.After(items[j].at) })
	start := (page - 1) * pageSize
	if start >= len(items) {
		return []models.Book{}, []searchDocResult{}
	}
	end := start + pageSize
	if end > len(items) {
		end = len(items)
	}
	pageBooks := []models.Book{}
	pageDocs := []searchDocResult{}
	for _, result := range items[start:end] {
		if result.book != nil {
			pageBooks = append(pageBooks, *result.book)
		} else {
			pageDocs = append(pageDocs, *result.doc)
		}
	}
	return pageBooks, pageDocs
}
