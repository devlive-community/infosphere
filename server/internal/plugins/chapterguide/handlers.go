package chapterguide

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"

	"knowforge/server/internal/eventhub"
	"knowforge/server/internal/models"
	"knowforge/server/internal/plugincore"
)

const (
	maxSummaryRunes  = 2000
	maxPointRunes    = 300
	maxPoints        = 12
	maxOverviewRunes = 10000
	streamHeartbeat  = 25 * time.Second
)

func (b *behavior) RegisterRoutes(api *gin.RouterGroup, core plugincore.Core) {
	b.core = core
	feat := core.RequireFeaturePlugin(pluginKey)
	// 读者：已发布章节的导读、全书概览
	api.GET("/chapter-guides/docs/:id", core.OptionalAuth(), feat, b.ReaderGuide)
	api.GET("/chapter-guides/books/:id/overview", core.OptionalAuth(), feat, b.ReaderOverview)
	// 作者（可编辑该书）
	use := core.RequirePermissionMiddleware(PermUse)
	with := func(h gin.HandlerFunc) []gin.HandlerFunc { return []gin.HandlerFunc{core.RequireAuth(), feat, use, h} }
	api.GET("/chapter-guides/books/:id", with(b.BookGuides)...)
	api.PUT("/chapter-guides/books/:id/settings", with(b.UpdateBookSettings)...)
	api.POST("/chapter-guides/books/:id/generate", with(b.Generate)...)
	api.POST("/chapter-guides/books/:id/overview/generate", with(b.GenerateOverview)...)
	api.PUT("/chapter-guides/books/:id/overview", with(b.EditOverview)...)
	api.GET("/chapter-guides/books/:id/stream", core.RequireAuthStream(), feat, use, b.Stream)
	api.PUT("/chapter-guides/docs/:id", with(b.EditGuide)...)
	api.DELETE("/chapter-guides/docs/:id", with(b.DeleteGuide)...)
	// 管理员
	admin := func(h gin.HandlerFunc) []gin.HandlerFunc {
		return []gin.HandlerFunc{core.RequireAuth(), core.RequireAdmin(), feat, core.RequirePermissionMiddleware(PermManage), h}
	}
	api.GET("/admin/chapter-guides/settings", admin(b.AdminGetSettings)...)
	api.PUT("/admin/chapter-guides/settings", admin(b.AdminUpdateSettings)...)
}

// —— 读者 ——

// ReaderGuide GET /chapter-guides/docs/:id 已发布章节的导读（无导读返回 guide=null）；未解锁的付费章节不显示，避免泄露正文。
func (b *behavior) ReaderGuide(c *gin.Context) {
	db := b.core.Gorm()
	var doc models.Document
	var book models.Book
	u := b.core.CurrentUser(c)
	if db.First(&doc, c.Param("id")).Error != nil || db.First(&book, doc.BookID).Error != nil || !b.core.CanReadBook(u, &book) {
		b.core.Fail(c, http.StatusNotFound, "章节不存在")
		return
	}
	editor := u != nil && b.core.CanEditBookContent(u, &book)
	if !editor && (doc.Status != "published" || !plugincore.CheckContentAccess(b.core, u, &book, &doc).Allowed) {
		b.core.OK(c, gin.H{"guide": nil})
		return
	}
	var g Guide
	if db.Where("doc_id = ?", doc.ID).First(&g).Error != nil || g.Summary == "" {
		b.core.OK(c, gin.H{"guide": nil})
		return
	}
	v := toGuideView(g, &doc)
	b.core.OK(c, gin.H{"guide": gin.H{"summary": v.Summary, "points": v.Points, "generated_at": v.GeneratedAt, "edited": v.Edited}})
}

// ReaderOverview GET /chapter-guides/books/:id/overview 全书概览（无概览返回 overview=null）。
func (b *behavior) ReaderOverview(c *gin.Context) {
	book, status := b.core.FindBook(c)
	if book == nil || !b.core.CanReadBook(b.core.CurrentUser(c), book) {
		if book != nil {
			status = http.StatusNotFound
		}
		b.core.Fail(c, status, "书籍不存在")
		return
	}
	var o Overview
	if b.core.Gorm().First(&o, book.ID).Error != nil || strings.TrimSpace(o.Content) == "" {
		b.core.OK(c, gin.H{"overview": nil})
		return
	}
	b.core.OK(c, gin.H{"overview": gin.H{"content": o.Content, "generated_at": o.GeneratedAt}})
}

// —— 作者 ——

func (b *behavior) editableBook(c *gin.Context) (*models.Book, *models.User, bool) {
	book, status := b.core.FindBook(c)
	if book == nil {
		b.core.Fail(c, status, "书籍不存在")
		return nil, nil, false
	}
	u := b.core.CurrentUser(c)
	if !b.core.CanEditBookContent(u, book) {
		b.core.Fail(c, http.StatusForbidden, "没有编辑这本书的权限")
		return nil, nil, false
	}
	return book, u, true
}

// editableDoc 当前用户可编辑的章节。
func (b *behavior) editableDoc(c *gin.Context) (*models.Document, *models.Book, bool) {
	var doc models.Document
	var book models.Book
	db := b.core.Gorm()
	if db.First(&doc, c.Param("id")).Error != nil || db.First(&book, doc.BookID).Error != nil {
		b.core.Fail(c, http.StatusNotFound, "章节不存在")
		return nil, nil, false
	}
	if !b.core.CanEditBookContent(b.core.CurrentUser(c), &book) {
		b.core.Fail(c, http.StatusForbidden, "没有编辑这本书的权限")
		return nil, nil, false
	}
	return &doc, &book, true
}

type chapterRow struct {
	Doc   gin.H      `json:"doc"`
	Guide *guideView `json:"guide"`
}

// BookGuides GET /chapter-guides/books/:id 本书各章节的导读状态、全书概览、自动生成设置与本月额度。
func (b *behavior) BookGuides(c *gin.Context) {
	book, u, ok := b.editableBook(c)
	if !ok {
		return
	}
	db := b.core.Gorm()
	var docs []models.Document
	db.Where("book_id = ?", book.ID).Order("sort_order ASC, id ASC").Find(&docs)
	guides := map[uint]Guide{}
	var rows []Guide
	db.Where("book_id = ?", book.ID).Find(&rows)
	for _, g := range rows {
		guides[g.DocID] = g
	}
	chapters := []chapterRow{}
	for _, t := range treeWithDepth(docs) {
		row := chapterRow{Doc: gin.H{"id": t.doc.ID, "title": t.doc.Title, "slug": t.doc.Slug, "status": t.doc.Status, "depth": t.depth, "empty": strings.TrimSpace(t.doc.Content) == ""}}
		if g, has := guides[t.doc.ID]; has && (g.Summary != "" || g.Status != "") {
			d := t.doc
			v := toGuideView(g, &d)
			row.Guide = &v
		}
		chapters = append(chapters, row)
	}
	var overview *overviewView
	var o Overview
	if db.First(&o, book.ID).Error == nil {
		v := b.toOverviewView(o)
		overview = &v
	}
	chat, _ := b.core.AIStatus()
	b.core.OK(c, gin.H{
		"available": chat, "auto_generate": b.autoEnabled(book.ID), "cost_bearer": b.costBearer(),
		"quota":    gin.H{"limit": plugincore.EntitlementValue(b.core, u, entMonthly), "used": b.monthUsed(u.ID)},
		"chapters": chapters, "overview": overview,
	})
}

// UpdateBookSettings PUT /chapter-guides/books/:id/settings {auto_generate}
func (b *behavior) UpdateBookSettings(c *gin.Context) {
	book, _, ok := b.editableBook(c)
	if !ok {
		return
	}
	var req struct {
		AutoGenerate bool `json:"auto_generate"`
	}
	if c.ShouldBindJSON(&req) != nil {
		b.core.Fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	b.core.Gorm().Save(&BookSetting{BookID: book.ID, AutoGenerate: req.AutoGenerate})
	b.core.OK(c, gin.H{"auto_generate": req.AutoGenerate})
}

// Generate POST /chapter-guides/books/:id/generate {doc_ids?, scope: missing|ids, force?}
// scope=missing 为没有导读或已过期（未经作者编辑）的有正文章节；scope=ids 为指定章节（force 为 true 时即使内容未变也重新生成）。
// 需要生成的章数超过本月剩余次数时拒绝。
func (b *behavior) Generate(c *gin.Context) {
	book, u, ok := b.editableBook(c)
	if !ok {
		return
	}
	var req struct {
		Scope  string `json:"scope"`
		DocIDs []uint `json:"doc_ids"`
		Force  bool   `json:"force"`
	}
	if c.ShouldBindJSON(&req) != nil || (req.Scope != "missing" && req.Scope != "ids") {
		b.core.Fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if chat, _ := b.core.AIStatus(); !chat {
		b.core.Fail(c, http.StatusServiceUnavailable, "AI 服务暂未配置")
		return
	}
	db := b.core.Gorm()
	var docs []models.Document
	q := db.Where("book_id = ?", book.ID)
	if req.Scope == "ids" {
		if len(req.DocIDs) == 0 {
			b.core.Fail(c, http.StatusBadRequest, "请选择章节")
			return
		}
		q = q.Where("id IN ?", req.DocIDs)
	}
	q.Order("sort_order ASC, id ASC").Find(&docs)
	guides := map[uint]Guide{}
	var rows []Guide
	db.Where("book_id = ?", book.ID).Find(&rows)
	for _, g := range rows {
		guides[g.DocID] = g
	}
	var todo []models.Document
	for _, d := range treeOrder(docs) {
		if strings.TrimSpace(d.Content) == "" {
			continue
		}
		g, has := guides[d.ID]
		if g.Status == stateQueued || g.Status == stateGenerating {
			continue
		}
		if req.Scope == "missing" && has && g.Summary != "" && (g.Edited || g.SourceHash == docHash(&d)) {
			continue
		}
		todo = append(todo, d)
	}
	if len(todo) == 0 {
		b.core.Fail(c, http.StatusBadRequest, "没有需要生成导读的章节")
		return
	}
	limit, used := plugincore.EntitlementValue(b.core, u, entMonthly), b.monthUsed(u.ID)
	if limit != plugincore.Unlimited && used+int64(len(todo)) > limit {
		msg := fmt.Sprintf("本月导读生成次数不足：需要 %d 次，剩余 %d 次；下月恢复，或提升等级/开通会员获得更多次数", len(todo), max(0, limit-used))
		if limit == 0 {
			msg = "当前等级/会员不含章节导读，提升等级或开通会员后可用"
		}
		b.core.Fail(c, http.StatusTooManyRequests, msg)
		return
	}
	for _, d := range todo {
		if err := b.enqueueChapter(book.ID, d.ID, u.ID, req.Force); err != nil {
			b.core.Fail(c, http.StatusServiceUnavailable, err.Error())
			return
		}
	}
	b.core.OK(c, gin.H{"queued": len(todo)})
}

// GenerateOverview POST /chapter-guides/books/:id/overview/generate {force?} 生成全书概览（基于已发布章节的导读或开头）。
func (b *behavior) GenerateOverview(c *gin.Context) {
	book, u, ok := b.editableBook(c)
	if !ok {
		return
	}
	var req struct {
		Force bool `json:"force"`
	}
	_ = c.ShouldBindJSON(&req)
	if chat, _ := b.core.AIStatus(); !chat {
		b.core.Fail(c, http.StatusServiceUnavailable, "AI 服务暂未配置")
		return
	}
	if !plugincore.WithinLimit(plugincore.EntitlementValue(b.core, u, entMonthly), b.monthUsed(u.ID)) {
		b.core.Fail(c, http.StatusTooManyRequests, errQuota.Error())
		return
	}
	var o Overview
	if b.core.Gorm().First(&o, book.ID).Error == nil && (o.Status == stateQueued || o.Status == stateGenerating) {
		b.core.Fail(c, http.StatusConflict, "全书概览正在生成")
		return
	}
	if err := b.enqueueOverview(book.ID, u.ID, req.Force); err != nil {
		b.core.Fail(c, http.StatusServiceUnavailable, err.Error())
		return
	}
	b.core.OK(c, gin.H{"queued": true})
}

// EditOverview PUT /chapter-guides/books/:id/overview {content} 作者编辑全书概览（此后不被自动覆盖；清空即删除）。
func (b *behavior) EditOverview(c *gin.Context) {
	book, _, ok := b.editableBook(c)
	if !ok {
		return
	}
	var req struct {
		Content string `json:"content"`
	}
	if c.ShouldBindJSON(&req) != nil || utf8.RuneCountInString(req.Content) > maxOverviewRunes {
		b.core.Fail(c, http.StatusBadRequest, "概览不能超过 1 万字")
		return
	}
	db := b.core.Gorm()
	content := strings.TrimSpace(req.Content)
	if content == "" {
		db.Delete(&Overview{}, book.ID)
		booksHub.Publish(book.ID, "overview", nil)
		b.core.OK(c, gin.H{"overview": nil})
		return
	}
	hash, _ := b.overviewSource(book.ID)
	now := time.Now()
	db.Save(&Overview{BookID: book.ID, Content: content, SourceHash: hash, Status: stateReady, Edited: true, GeneratedAt: &now})
	b.publishOverview(book.ID)
	var o Overview
	db.First(&o, book.ID)
	b.core.OK(c, gin.H{"overview": b.toOverviewView(o)})
}

// EditGuide PUT /chapter-guides/docs/:id {summary, points[]} 作者编辑导读（视为与当前内容一致；此后不被自动覆盖）。
func (b *behavior) EditGuide(c *gin.Context) {
	doc, book, ok := b.editableDoc(c)
	if !ok {
		return
	}
	var req struct {
		Summary string   `json:"summary"`
		Points  []string `json:"points"`
	}
	if c.ShouldBindJSON(&req) != nil {
		b.core.Fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	summary := strings.TrimSpace(req.Summary)
	points := []string{}
	for _, p := range req.Points {
		if p = strings.TrimSpace(p); p != "" {
			if utf8.RuneCountInString(p) > maxPointRunes {
				b.core.Fail(c, http.StatusBadRequest, "每条要点不能超过 300 字")
				return
			}
			points = append(points, p)
		}
	}
	if summary == "" || utf8.RuneCountInString(summary) > maxSummaryRunes || len(points) > maxPoints {
		b.core.Fail(c, http.StatusBadRequest, "请填写导读（不超过 2000 字，要点不超过 12 条）")
		return
	}
	raw, _ := json.Marshal(points)
	db := b.core.Gorm()
	g := Guide{BookID: book.ID, DocID: doc.ID}
	db.Where("doc_id = ?", doc.ID).FirstOrCreate(&g)
	now := time.Now()
	db.Model(&g).Updates(map[string]any{"summary": summary, "points": string(raw), "source_hash": docHash(doc), "status": stateReady, "error": "",
		"edited": true, "dirty_at": nil, "generated_at": &now})
	db.First(&g, g.ID)
	b.publishGuide(book.ID, g)
	b.core.OK(c, toGuideView(g, doc))
}

// DeleteGuide DELETE /chapter-guides/docs/:id 删除章节导读（进行中的不可删除）。
func (b *behavior) DeleteGuide(c *gin.Context) {
	doc, book, ok := b.editableDoc(c)
	if !ok {
		return
	}
	db := b.core.Gorm()
	var g Guide
	if db.Where("doc_id = ?", doc.ID).First(&g).Error != nil {
		b.core.OK(c, gin.H{"deleted": false})
		return
	}
	if g.Status == stateQueued || g.Status == stateGenerating {
		b.core.Fail(c, http.StatusConflict, "导读正在生成")
		return
	}
	db.Delete(&g)
	booksHub.Publish(book.ID, "guide", guideView{DocID: doc.ID, Points: []string{}})
	b.core.OK(c, gin.H{"deleted": true})
}

// Stream GET /chapter-guides/books/:id/stream（?ticket= 事件流凭证鉴权）本书导读与概览的状态变化：
// guide（章节导读，含 doc_id）、overview（全书概览；删除时为 null）；25 秒心跳，不主动结束。
func (b *behavior) Stream(c *gin.Context) {
	book, _, ok := b.editableBook(c)
	if !ok {
		return
	}
	eventhub.StartSSE(c)
	ch := booksHub.Subscribe(book.ID)
	defer booksHub.Unsubscribe(book.ID, ch)
	eventhub.Write(c.Writer, "ready", []byte("{}"))
	heartbeat := time.NewTicker(streamHeartbeat)
	defer heartbeat.Stop()
	for {
		select {
		case <-c.Request.Context().Done():
			return
		case ev, ok := <-ch:
			if !ok {
				return
			}
			eventhub.Write(c.Writer, ev.Name, ev.Data)
		case <-heartbeat.C:
			eventhub.Ping(c.Writer)
		}
	}
}

// —— 管理员 ——

// AdminGetSettings GET /admin/chapter-guides/settings {cost_bearer: author|site}
func (b *behavior) AdminGetSettings(c *gin.Context) {
	chat, _ := b.core.AIStatus()
	b.core.OK(c, gin.H{"cost_bearer": b.costBearer(), "ai_available": chat})
}

// AdminUpdateSettings PUT /admin/chapter-guides/settings {cost_bearer}
func (b *behavior) AdminUpdateSettings(c *gin.Context) {
	var req struct {
		CostBearer string `json:"cost_bearer"`
	}
	if c.ShouldBindJSON(&req) != nil || (req.CostBearer != bearerAuthor && req.CostBearer != bearerSite) {
		b.core.Fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if err := b.core.SetSetting(cfgCostBearer, req.CostBearer, "章节导读：费用承担方（author 作者 / site 站点）"); err != nil {
		b.core.Fail(c, http.StatusInternalServerError, "保存失败")
		return
	}
	b.core.RecordAudit(c, "chapterguide.settings_updated", "chapterguide", "settings", "章节导读设置", map[string]any{"cost_bearer": req.CostBearer})
	chat, _ := b.core.AIStatus()
	b.core.OK(c, gin.H{"cost_bearer": req.CostBearer, "ai_available": chat})
}
