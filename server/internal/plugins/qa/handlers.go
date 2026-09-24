package qa

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"knowforge/server/internal/ai"
	"knowforge/server/internal/models"
	"knowforge/server/internal/plugincore"
	"knowforge/server/internal/plugins"
)

type behavior struct{ core plugincore.Core }

func (b *behavior) Key() string { return plugins.KeyQA }

func (b *behavior) RegisterRoutes(api *gin.RouterGroup, core plugincore.Core) {
	b.core = core
	feat := core.RequireFeaturePlugin(plugins.KeyQA)
	use := core.RequirePermissionMiddleware(PermUse)
	// 公开（书籍可读即可）
	api.GET("/qa/books/:id/status", core.OptionalAuth(), feat, b.Status)
	api.GET("/qa/books/:id/questions", core.OptionalAuth(), feat, b.ListQuestions)
	api.GET("/qa/questions/:id", core.OptionalAuth(), feat, b.GetQuestion)
	// 登录用户
	auth := []gin.HandlerFunc{core.RequireAuth(), feat, use}
	with := func(h gin.HandlerFunc) []gin.HandlerFunc { return append(append([]gin.HandlerFunc{}, auth...), h) }
	api.POST("/qa/books/:id/ask", with(b.AskAI)...)
	api.GET("/qa/books/:id/asks", with(b.MyAsks)...)
	api.GET("/qa/me/asks", with(b.MyAllAsks)...)
	api.DELETE("/qa/asks/:id", with(b.DeleteAsk)...)
	api.GET("/qa/asks/:id", with(b.GetAsk)...)
	api.POST("/qa/asks/:id/cancel", with(b.CancelAsk)...)
	api.GET("/qa/me/questions", with(b.MyQuestions)...)
	api.GET("/qa/me/quota", with(b.MyQuota)...)
	api.POST("/qa/books/:id/reindex", with(b.Reindex)...)
	api.POST("/qa/books/:id/questions", with(b.CreateQuestion)...)
	api.DELETE("/qa/questions/:id", with(b.DeleteQuestion)...)
	api.POST("/qa/questions/:id/answers", with(b.CreateAnswer)...)
	api.POST("/qa/answers/:id/accept", with(b.AcceptAnswer)...)
	api.DELETE("/qa/answers/:id", with(b.DeleteAnswer)...)
	// 管理员
	admin := func(h gin.HandlerFunc) []gin.HandlerFunc {
		return []gin.HandlerFunc{core.RequireAuth(), core.RequireAdmin(), feat, core.RequirePermissionMiddleware(PermManage), h}
	}
	api.GET("/admin/qa/settings", admin(b.AdminGetSettings)...)
	api.PUT("/admin/qa/settings", admin(b.AdminUpdateSettings)...)
}

// —— 设置 ——

type settings struct {
	AIEnabled    bool `json:"ai_enabled"`
	AgentEnabled bool `json:"agent_enabled"`
	TopK         int  `json:"top_k"`
}

func (b *behavior) settings() settings {
	s := settings{AIEnabled: b.core.GetSetting("qa_ai_enabled") != "false", AgentEnabled: b.core.GetSetting("qa_agent_enabled") != "false", TopK: 6}
	if v := b.core.AtoiDefault(b.core.GetSetting("qa_top_k"), 6); v >= 3 && v <= 12 {
		s.TopK = v
	}
	return s
}

// AdminGetSettings GET /admin/qa/settings
func (b *behavior) AdminGetSettings(c *gin.Context) {
	chat, embed := b.core.AIStatus()
	b.core.OK(c, gin.H{"settings": b.settings(), "ai_chat_available": chat, "ai_embed_available": embed})
}

// AdminUpdateSettings PUT /admin/qa/settings（可只传部分字段）
func (b *behavior) AdminUpdateSettings(c *gin.Context) {
	var req struct {
		AIEnabled    *bool `json:"ai_enabled"`
		AgentEnabled *bool `json:"agent_enabled"`
		TopK         *int  `json:"top_k"`
	}
	if c.ShouldBindJSON(&req) != nil {
		b.core.Fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	old := b.settings()
	fields := []string{}
	if req.TopK != nil && (*req.TopK < 3 || *req.TopK > 12) {
		b.core.Fail(c, http.StatusBadRequest, "检索片段数需在 3 到 12 之间")
		return
	}
	if req.AIEnabled != nil && *req.AIEnabled != old.AIEnabled {
		_ = b.core.SetSetting("qa_ai_enabled", strconv.FormatBool(*req.AIEnabled), "问答：开放 AI 问答")
		fields = append(fields, "ai_enabled")
	}
	if req.AgentEnabled != nil && *req.AgentEnabled != old.AgentEnabled {
		_ = b.core.SetSetting("qa_agent_enabled", strconv.FormatBool(*req.AgentEnabled), "问答：开放 Agent 模式")
		fields = append(fields, "agent_enabled")
	}
	if req.TopK != nil && *req.TopK != old.TopK {
		_ = b.core.SetSetting("qa_top_k", strconv.Itoa(*req.TopK), "问答：每次检索的片段数")
		fields = append(fields, "top_k")
	}
	if len(fields) > 0 {
		b.core.RecordAudit(c, "qa.settings_updated", "qa", "settings", "问答设置", map[string]any{"changed_fields": fields})
	}
	b.AdminGetSettings(c)
}

// —— 公共 ——

// readableBook 读者可见的书籍（不可见时写 404）。
func (b *behavior) readableBook(c *gin.Context) (*models.Book, bool) {
	book, _ := b.core.FindBook(c)
	if book == nil || !b.core.CanReadBook(b.core.CurrentUser(c), book) {
		b.core.Fail(c, http.StatusNotFound, "书籍不存在")
		return nil, false
	}
	return book, true
}

func (b *behavior) isEditor(u *models.User, book *models.Book) bool {
	return u != nil && (b.core.IsAdmin(u) || b.core.CanEditBookContent(u, book))
}

// dailyQuota 今日已用与上限（-1 不限）：全部 AI 提问与其中的深度模式提问。
// 计入进行中的提问与成功且实际调用了模型的提问（失败、取消、书中无相关内容不计）。
type dailyQuota struct {
	Used       int64 `json:"used"`
	Limit      int64 `json:"limit"`
	AgentUsed  int64 `json:"agent_used"`
	AgentLimit int64 `json:"agent_limit"`
}

func (b *behavior) quota(u *models.User) dailyQuota {
	now := time.Now()
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	q := dailyQuota{Limit: plugincore.EntitlementValue(b.core, u, entAIDaily), AgentLimit: plugincore.EntitlementValue(b.core, u, entAgentDaily)}
	var rows []struct {
		Mode string
		N    int64
	}
	b.core.Gorm().Model(&Ask{}).Select("mode, COUNT(*) AS n").
		Where("user_id = ? AND created_at >= ? AND (status = ? OR (status = ? AND calls > 0))", u.ID, start, askRunning, askDone).Group("mode").Scan(&rows)
	for _, r := range rows {
		q.Used += r.N
		if r.Mode == "agent" {
			q.AgentUsed = r.N
		}
	}
	return q
}

// Status GET /qa/books/:id/status AI 是否可用、索引状态与今日额度。
func (b *behavior) Status(c *gin.Context) {
	book, found := b.readableBook(c)
	if !found {
		return
	}
	chat, embed := b.core.AIStatus()
	s := b.settings()
	u := b.core.CurrentUser(c)
	agentOK := chat && s.AIEnabled && s.AgentEnabled
	out := gin.H{"ai_available": chat && s.AIEnabled, "agent_available": agentOK, "vector_search": embed}
	var state IndexState
	if b.core.Gorm().First(&state, book.ID).Error == nil {
		out["index"] = state
	}
	if u != nil {
		q := b.quota(u)
		out["quota"] = q
		out["agent_available"] = agentOK && q.AgentLimit != 0 // 权益为 0 表示当前等级/会员不含深度模式
		out["can_reindex"] = b.isEditor(u, book)
	}
	b.core.OK(c, out)
}

type askView struct {
	Ask
	Citations []Citation  `json:"citations"`
	Trace     []TraceStep `json:"trace"`
}

func toAskView(a Ask) askView {
	v := askView{Ask: a, Citations: []Citation{}, Trace: []TraceStep{}}
	_ = json.Unmarshal([]byte(a.Citations), &v.Citations)
	_ = json.Unmarshal([]byte(a.Trace), &v.Trace)
	return v
}

// AskAI POST /qa/books/:id/ask {question, doc_id?, selection?, mode: rag|agent}
// 校验与额度判定后立即返回 status=running 的问答记录，回答在后台生成（不限时长与轮数）；
// 客户端轮询 GET /qa/asks/:id 获取实时调用链与结果，可 POST /qa/asks/:id/cancel 取消。
func (b *behavior) AskAI(c *gin.Context) {
	book, found := b.readableBook(c)
	if !found {
		return
	}
	var req struct {
		Question  string `json:"question"`
		DocID     uint   `json:"doc_id"`
		Selection string `json:"selection"`
		Mode      string `json:"mode"`
	}
	if c.ShouldBindJSON(&req) != nil {
		b.core.Fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	question := strings.TrimSpace(req.Question)
	selection := strings.TrimSpace(req.Selection)
	if question == "" && selection != "" {
		question = "请解释这段内容"
	}
	if question == "" || utf8.RuneCountInString(question) > maxQuestionLen || utf8.RuneCountInString(selection) > maxSelectionLen {
		b.core.Fail(c, http.StatusBadRequest, "请填写问题（不超过 1000 字，选中内容不超过 2000 字）")
		return
	}
	s := b.settings()
	chat, _ := b.core.AIStatus()
	if !chat || !s.AIEnabled {
		b.core.Fail(c, http.StatusServiceUnavailable, "AI 问答暂未开放")
		return
	}
	mode := "rag"
	if req.Mode == "agent" {
		if !s.AgentEnabled {
			b.core.Fail(c, http.StatusBadRequest, "Agent 模式暂未开放")
			return
		}
		mode = "agent"
	}
	u := b.core.CurrentUser(c)
	q := b.quota(u)
	if !plugincore.WithinLimit(q.Limit, q.Used) {
		b.core.Fail(c, http.StatusTooManyRequests, "今日 AI 提问次数已用完，明天再来，或提升等级/开通会员获得更多次数")
		return
	}
	if mode == "agent" && !plugincore.WithinLimit(q.AgentLimit, q.AgentUsed) {
		msg := "今日深度模式次数已用完，可以改用标准模式，或提升等级/开通会员获得更多次数"
		if q.AgentLimit == 0 {
			msg = "当前等级/会员不含深度模式，提升等级或开通会员后可用"
		}
		b.core.Fail(c, http.StatusTooManyRequests, msg)
		return
	}
	feature := "qa.ask"
	if mode == "agent" {
		feature = "qa.agent"
	}
	caller := ai.Caller{UserID: u.ID, Feature: feature, RefType: "book", RefID: book.ID, TraceID: ai.NewTraceID()}
	if err := b.core.AICheckQuota(ai.WithCaller(c.Request.Context(), caller)); err != nil {
		b.core.Fail(c, http.StatusTooManyRequests, err.Error())
		return
	}
	rec := Ask{BookID: book.ID, UserID: u.ID, DocID: req.DocID, Mode: mode, Question: question, Selection: selection,
		Status: askRunning, TraceID: caller.TraceID, Citations: "[]", Trace: "[]"}
	if err := b.core.Gorm().Create(&rec).Error; err != nil {
		b.core.Fail(c, http.StatusInternalServerError, "提问失败")
		return
	}
	b.startAsk(rec, *u, *book, caller, s.TopK)
	b.core.OK(c, toAskView(rec))
}

// GetAsk GET /qa/asks/:id 我的一条问答（含实时调用链；进行中时 status=running）。
func (b *behavior) GetAsk(c *gin.Context) {
	var rec Ask
	if b.core.Gorm().Where("id = ? AND user_id = ?", c.Param("id"), b.core.CurrentUser(c).ID).First(&rec).Error != nil {
		b.core.Fail(c, http.StatusNotFound, "记录不存在")
		return
	}
	b.core.OK(c, toAskView(rec))
}

// CancelAsk POST /qa/asks/:id/cancel 取消进行中的问答（已产生的调用照常记录）。
func (b *behavior) CancelAsk(c *gin.Context) {
	var rec Ask
	if b.core.Gorm().Where("id = ? AND user_id = ?", c.Param("id"), b.core.CurrentUser(c).ID).First(&rec).Error != nil {
		b.core.Fail(c, http.StatusNotFound, "记录不存在")
		return
	}
	if rec.Status != askRunning || !cancelAsk(rec.ID) {
		b.core.Fail(c, http.StatusConflict, "该问答已结束")
		return
	}
	b.core.OK(c, gin.H{"message": "正在取消"})
}

// MyAsks GET /qa/books/:id/asks?page= 我在本书的 AI 问答记录（含进行中、失败与已取消）。
func (b *behavior) MyAsks(c *gin.Context) {
	book, found := b.readableBook(c)
	if !found {
		return
	}
	page, pageSize := b.core.Paginate(c)
	q := b.core.Gorm().Model(&Ask{}).Where("book_id = ? AND user_id = ?", book.ID, b.core.CurrentUser(c).ID)
	var total int64
	q.Count(&total)
	var rows []Ask
	q.Order("id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&rows)
	items := make([]askView, 0, len(rows))
	for _, r := range rows {
		items = append(items, toAskView(r))
	}
	b.core.OK(c, plugincore.PageResult{Items: items, Total: total, Page: page, PageSize: pageSize})
}

// MyQuota GET /qa/me/quota 今日 AI 提问额度（全部 / 深度模式）。
func (b *behavior) MyQuota(c *gin.Context) {
	b.core.OK(c, b.quota(b.core.CurrentUser(c)))
}

type bookBrief struct {
	ID    uint   `json:"id"`
	Slug  string `json:"slug"`
	Title string `json:"title"`
}

// books 按 ID 批量取书籍摘要（只返回当前用户仍可阅读的书）。
func (b *behavior) books(u *models.User, ids []uint) map[uint]bookBrief {
	out := map[uint]bookBrief{}
	if len(ids) == 0 {
		return out
	}
	var list []models.Book
	b.core.Gorm().Where("id IN ?", ids).Find(&list)
	for i := range list {
		if b.core.CanReadBook(u, &list[i]) {
			out[list[i].ID] = bookBrief{ID: list[i].ID, Slug: list[i].Slug, Title: list[i].Title}
		}
	}
	return out
}

// MyAllAsks GET /qa/me/asks?page=&book_id= 我在全部书籍中的 AI 问答记录（含消耗与调用链，含进行中/失败/已取消），新→旧。
func (b *behavior) MyAllAsks(c *gin.Context) {
	u := b.core.CurrentUser(c)
	page, pageSize := b.core.Paginate(c)
	q := b.core.Gorm().Model(&Ask{}).Where("user_id = ?", u.ID)
	if id := b.core.AtoiDefault(c.Query("book_id"), 0); id > 0 {
		q = q.Where("book_id = ?", id)
	}
	var total int64
	q.Count(&total)
	var rows []Ask
	q.Order("id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&rows)
	ids := make([]uint, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.BookID)
	}
	books := b.books(u, ids)
	items := make([]gin.H, 0, len(rows))
	for _, r := range rows {
		book, visible := books[r.BookID]
		items = append(items, gin.H{"ask": toAskView(r), "book": book, "book_available": visible})
	}
	b.core.OK(c, plugincore.PageResult{Items: items, Total: total, Page: page, PageSize: pageSize})
}

// DeleteAsk DELETE /qa/asks/:id 删除自己的一条 AI 问答记录（进行中的会先取消；不退还当日次数）。
func (b *behavior) DeleteAsk(c *gin.Context) {
	var rec Ask
	if b.core.Gorm().Where("id = ? AND user_id = ?", c.Param("id"), b.core.CurrentUser(c).ID).First(&rec).Error != nil {
		b.core.Fail(c, http.StatusNotFound, "记录不存在")
		return
	}
	cancelAsk(rec.ID) // 进行中的先取消（已产生的调用仍记入 AI 用量）
	b.core.Gorm().Delete(&Ask{}, rec.ID)
	b.core.OK(c, gin.H{"message": "已删除"})
}

// MyQuestions GET /qa/me/questions?page= 我在社区问答中的提问。
func (b *behavior) MyQuestions(c *gin.Context) {
	u := b.core.CurrentUser(c)
	page, pageSize := b.core.Paginate(c)
	q := b.core.Gorm().Model(&Question{}).Where("user_id = ?", u.ID)
	var total int64
	q.Count(&total)
	var rows []Question
	q.Order("updated_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&rows)
	ids := make([]uint, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.BookID)
	}
	books := b.books(u, ids)
	views := b.questionViews(rows)
	items := make([]gin.H, 0, len(rows))
	for i, r := range rows {
		book, visible := books[r.BookID]
		items = append(items, gin.H{"question": views[i], "book": book, "book_available": visible})
	}
	b.core.OK(c, plugincore.PageResult{Items: items, Total: total, Page: page, PageSize: pageSize})
}

// Reindex POST /qa/books/:id/reindex 作者/管理员重建索引（向量在后台计算）。
func (b *behavior) Reindex(c *gin.Context) {
	book, found := b.readableBook(c)
	if !found {
		return
	}
	if !b.isEditor(b.core.CurrentUser(c), book) {
		b.core.Fail(c, http.StatusForbidden, "只有作者可以重建索引")
		return
	}
	b.core.Gorm().Model(&IndexState{}).Where("book_id = ?", book.ID).Update("content_hash", "")
	state, err := b.ensureIndex(c.Request.Context(), book.ID)
	if err != nil {
		b.core.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	b.core.OK(c, state)
}

// —— 社区问答 ——

type userBrief struct {
	ID       uint   `json:"id"`
	Username string `json:"username"`
	Nickname string `json:"nickname"`
	Avatar   string `json:"avatar"`
}

func (b *behavior) users(ids []uint) map[uint]userBrief {
	out := map[uint]userBrief{}
	if len(ids) == 0 {
		return out
	}
	var list []models.User
	b.core.Gorm().Select("id, username, nickname, avatar").Where("id IN ?", ids).Find(&list)
	for _, u := range list {
		out[u.ID] = userBrief{ID: u.ID, Username: u.Username, Nickname: u.Nickname, Avatar: u.Avatar}
	}
	return out
}

type questionView struct {
	Question
	AICitations []Citation `json:"ai_citations"`
	User        userBrief  `json:"user"`
}

func (b *behavior) questionViews(rows []Question) []questionView {
	ids := []uint{}
	for _, q := range rows {
		ids = append(ids, q.UserID)
	}
	users := b.users(ids)
	out := make([]questionView, 0, len(rows))
	for _, q := range rows {
		v := questionView{Question: q, AICitations: []Citation{}, User: users[q.UserID]}
		_ = json.Unmarshal([]byte(q.AICitations), &v.AICitations)
		out = append(out, v)
	}
	return out
}

// ListQuestions GET /qa/books/:id/questions?filter=all|open|resolved&q=&page=
func (b *behavior) ListQuestions(c *gin.Context) {
	book, found := b.readableBook(c)
	if !found {
		return
	}
	page, pageSize := b.core.Paginate(c)
	q := b.core.Gorm().Model(&Question{}).Where("book_id = ?", book.ID)
	switch c.Query("filter") {
	case "open":
		q = q.Where("status = ?", "open")
	case "resolved":
		q = q.Where("status = ?", "resolved")
	}
	if kw := strings.TrimSpace(c.Query("q")); kw != "" {
		like := "%" + kw + "%"
		q = q.Where("title LIKE ? OR body LIKE ?", like, like)
	}
	var total int64
	q.Count(&total)
	var rows []Question
	q.Order("CASE WHEN status = 'resolved' THEN 0 ELSE 1 END, updated_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&rows)
	b.core.OK(c, plugincore.PageResult{Items: b.questionViews(rows), Total: total, Page: page, PageSize: pageSize})
}

// CreateQuestion POST /qa/books/:id/questions {title, body?, doc_id?, selection?, ask_id?}（ask_id 附带自己的 AI 回答作参考）
func (b *behavior) CreateQuestion(c *gin.Context) {
	book, found := b.readableBook(c)
	if !found {
		return
	}
	var req struct {
		Title     string `json:"title"`
		Body      string `json:"body"`
		DocID     uint   `json:"doc_id"`
		Selection string `json:"selection"`
		AskID     uint   `json:"ask_id"`
	}
	if c.ShouldBindJSON(&req) != nil {
		b.core.Fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	title, body := strings.TrimSpace(req.Title), strings.TrimSpace(req.Body)
	if title == "" || utf8.RuneCountInString(title) > 200 || utf8.RuneCountInString(body) > 10000 || utf8.RuneCountInString(req.Selection) > maxSelectionLen {
		b.core.Fail(c, http.StatusBadRequest, "请填写标题（不超过 200 字，正文不超过 10000 字）")
		return
	}
	u := b.core.CurrentUser(c)
	q := Question{BookID: book.ID, UserID: u.ID, DocID: req.DocID, Title: title, Body: body, Selection: strings.TrimSpace(req.Selection), Status: "open"}
	if req.AskID != 0 {
		var ask Ask
		if b.core.Gorm().Where("id = ? AND user_id = ? AND book_id = ? AND status = ?", req.AskID, u.ID, book.ID, askDone).First(&ask).Error == nil {
			q.AIAnswer, q.AICitations = ask.Answer, ask.Citations
			if q.Selection == "" {
				q.Selection, q.DocID = ask.Selection, ask.DocID
			}
		}
	}
	if err := b.core.Gorm().Create(&q).Error; err != nil {
		b.core.Fail(c, http.StatusInternalServerError, "提问失败")
		return
	}
	if book.UserID != u.ID {
		b.core.NotifyI18n(book.UserID, "comment", "notify.qa.asked", map[string]string{"book": book.Title, "title": q.Title},
			map[string]any{"link": "/book/detail/" + book.Slug + "?tab=qa&question=" + strconv.FormatUint(uint64(q.ID), 10)})
	}
	b.core.OK(c, b.questionViews([]Question{q})[0])
}

func (b *behavior) findQuestion(c *gin.Context) (*Question, *models.Book, bool) {
	var q Question
	if b.core.Gorm().First(&q, c.Param("id")).Error != nil {
		b.core.Fail(c, http.StatusNotFound, "问题不存在")
		return nil, nil, false
	}
	var book models.Book
	if b.core.Gorm().First(&book, q.BookID).Error != nil || !b.core.CanReadBook(b.core.CurrentUser(c), &book) {
		b.core.Fail(c, http.StatusNotFound, "问题不存在")
		return nil, nil, false
	}
	return &q, &book, true
}

// GetQuestion GET /qa/questions/:id 问题详情与回答（采纳的回答排在最前）。
func (b *behavior) GetQuestion(c *gin.Context) {
	q, book, found := b.findQuestion(c)
	if !found {
		return
	}
	var answers []Answer
	b.core.Gorm().Where("question_id = ?", q.ID).Order("id ASC").Find(&answers)
	ids := []uint{}
	for _, a := range answers {
		ids = append(ids, a.UserID)
	}
	users := b.users(ids)
	items := make([]gin.H, 0, len(answers))
	u := b.core.CurrentUser(c)
	editor := b.isEditor(u, book)
	for _, a := range answers {
		item := gin.H{"answer": a, "user": users[a.UserID], "accepted": a.ID == q.AcceptedAnswerID, "is_author": a.UserID == book.UserID,
			"can_delete": u != nil && (u.ID == a.UserID || editor)}
		if a.ID == q.AcceptedAnswerID {
			items = append([]gin.H{item}, items...)
		} else {
			items = append(items, item)
		}
	}
	mine := u != nil && (u.ID == q.UserID || editor)
	b.core.OK(c, gin.H{"question": b.questionViews([]Question{*q})[0], "answers": items, "can_accept": mine, "can_manage": mine})
}

// CreateAnswer POST /qa/questions/:id/answers {body}
func (b *behavior) CreateAnswer(c *gin.Context) {
	q, book, found := b.findQuestion(c)
	if !found {
		return
	}
	var req struct {
		Body string `json:"body"`
	}
	if c.ShouldBindJSON(&req) != nil || strings.TrimSpace(req.Body) == "" || utf8.RuneCountInString(req.Body) > 10000 {
		b.core.Fail(c, http.StatusBadRequest, "请填写回答（不超过 10000 字）")
		return
	}
	u := b.core.CurrentUser(c)
	a := Answer{QuestionID: q.ID, UserID: u.ID, Body: strings.TrimSpace(req.Body)}
	err := b.core.Gorm().Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&a).Error; err != nil {
			return err
		}
		return tx.Model(&Question{}).Where("id = ?", q.ID).Updates(map[string]any{"answer_count": gorm.Expr("answer_count + 1"), "updated_at": time.Now()}).Error
	})
	if err != nil {
		b.core.Fail(c, http.StatusInternalServerError, "回答失败")
		return
	}
	if q.UserID != u.ID {
		b.core.NotifyI18n(q.UserID, "comment", "notify.qa.answered", map[string]string{"title": q.Title},
			map[string]any{"link": "/book/detail/" + book.Slug + "?tab=qa&question=" + strconv.FormatUint(uint64(q.ID), 10)})
	}
	b.core.OK(c, a)
}

// AcceptAnswer POST /qa/answers/:id/accept 提问者或作者采纳回答（再次采纳同一回答则取消）。
func (b *behavior) AcceptAnswer(c *gin.Context) {
	var a Answer
	if b.core.Gorm().First(&a, c.Param("id")).Error != nil {
		b.core.Fail(c, http.StatusNotFound, "回答不存在")
		return
	}
	var q Question
	var book models.Book
	if b.core.Gorm().First(&q, a.QuestionID).Error != nil || b.core.Gorm().First(&book, q.BookID).Error != nil {
		b.core.Fail(c, http.StatusNotFound, "问题不存在")
		return
	}
	u := b.core.CurrentUser(c)
	if u.ID != q.UserID && !b.isEditor(u, &book) {
		b.core.Fail(c, http.StatusForbidden, "只有提问者或作者可以采纳回答")
		return
	}
	updates := map[string]any{"accepted_answer_id": a.ID, "status": "resolved", "updated_at": time.Now()}
	if q.AcceptedAnswerID == a.ID {
		updates = map[string]any{"accepted_answer_id": 0, "status": "open", "updated_at": time.Now()}
	}
	b.core.Gorm().Model(&Question{}).Where("id = ?", q.ID).Updates(updates)
	if q.AcceptedAnswerID != a.ID && a.UserID != u.ID {
		b.core.NotifyI18n(a.UserID, "comment", "notify.qa.accepted", map[string]string{"title": q.Title},
			map[string]any{"link": "/book/detail/" + book.Slug + "?tab=qa&question=" + strconv.FormatUint(uint64(q.ID), 10)})
	}
	b.core.Gorm().First(&q, q.ID)
	b.core.OK(c, q)
}

// DeleteQuestion DELETE /qa/questions/:id 提问者、作者或管理员删除问题（连同回答）。
func (b *behavior) DeleteQuestion(c *gin.Context) {
	q, book, found := b.findQuestion(c)
	if !found {
		return
	}
	u := b.core.CurrentUser(c)
	if u.ID != q.UserID && !b.isEditor(u, book) {
		b.core.Fail(c, http.StatusForbidden, "无权删除该问题")
		return
	}
	_ = b.core.Gorm().Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("question_id = ?", q.ID).Delete(&Answer{}).Error; err != nil {
			return err
		}
		return tx.Delete(&Question{}, q.ID).Error
	})
	b.core.OK(c, gin.H{"message": "已删除"})
}

// DeleteAnswer DELETE /qa/answers/:id 回答者、作者或管理员删除回答。
func (b *behavior) DeleteAnswer(c *gin.Context) {
	var a Answer
	if b.core.Gorm().First(&a, c.Param("id")).Error != nil {
		b.core.Fail(c, http.StatusNotFound, "回答不存在")
		return
	}
	var q Question
	var book models.Book
	b.core.Gorm().First(&q, a.QuestionID)
	b.core.Gorm().First(&book, q.BookID)
	u := b.core.CurrentUser(c)
	if u.ID != a.UserID && !b.isEditor(u, &book) {
		b.core.Fail(c, http.StatusForbidden, "无权删除该回答")
		return
	}
	_ = b.core.Gorm().Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(&Answer{}, a.ID).Error; err != nil {
			return err
		}
		updates := map[string]any{"answer_count": gorm.Expr("CASE WHEN answer_count > 0 THEN answer_count - 1 ELSE 0 END")}
		if q.AcceptedAnswerID == a.ID {
			updates["accepted_answer_id"], updates["status"] = 0, "open"
		}
		return tx.Model(&Question{}).Where("id = ?", q.ID).Updates(updates).Error
	})
	b.core.OK(c, gin.H{"message": "已删除"})
}
