package qa

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

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

// quota 今日已用 AI 提问次数与上限（-1 不限）。
func (b *behavior) quota(u *models.User) (used, limit int64) {
	start := time.Now()
	start = time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, start.Location())
	b.core.Gorm().Model(&Ask{}).Where("user_id = ? AND created_at >= ?", u.ID, start).Count(&used)
	return used, plugincore.EntitlementValue(b.core, u, entAIDaily)
}

// Status GET /qa/books/:id/status AI 是否可用、索引状态与今日额度。
func (b *behavior) Status(c *gin.Context) {
	book, found := b.readableBook(c)
	if !found {
		return
	}
	chat, embed := b.core.AIStatus()
	s := b.settings()
	out := gin.H{"ai_available": chat && s.AIEnabled, "agent_available": chat && s.AIEnabled && s.AgentEnabled, "vector_search": embed}
	var state IndexState
	if b.core.Gorm().First(&state, book.ID).Error == nil {
		out["index"] = state
	}
	if u := b.core.CurrentUser(c); u != nil {
		used, limit := b.quota(u)
		out["quota"] = gin.H{"used": used, "limit": limit}
		out["can_reindex"] = b.isEditor(u, book)
	}
	b.core.OK(c, out)
}

type askView struct {
	Ask
	Citations []Citation `json:"citations"`
}

func toAskView(a Ask) askView {
	v := askView{Ask: a, Citations: []Citation{}}
	_ = json.Unmarshal([]byte(a.Citations), &v.Citations)
	return v
}

// AskAI POST /qa/books/:id/ask {question, doc_id?, selection?, mode: rag|agent}
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
	if used, limit := b.quota(u); limit != plugincore.Unlimited && used >= limit {
		b.core.Fail(c, http.StatusTooManyRequests, "今日 AI 提问次数已用完，明天再来，或提升等级/开通会员获得更多次数")
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 150*time.Second)
	defer cancel()
	if _, err := b.ensureIndex(ctx, book.ID); err != nil {
		b.core.Fail(c, http.StatusInternalServerError, "建立索引失败: "+err.Error())
		return
	}
	chunks := b.loadChunks(u, book)
	var (
		answer string
		cites  []Citation
		steps  int
		err    error
	)
	if mode == "agent" {
		answer, cites, steps, err = b.answerAgent(ctx, book, chunks, question, selection, req.DocID)
	} else {
		answer, cites, err = b.answerRAG(ctx, book, chunks, question, selection, req.DocID, s.TopK)
	}
	rec := Ask{BookID: book.ID, UserID: u.ID, DocID: req.DocID, Mode: mode, Question: question, Selection: selection, Steps: steps, Status: "done"}
	if err != nil {
		rec.Status, rec.Error = "failed", truncate(err.Error(), 500)
		b.core.Gorm().Create(&rec)
		b.core.Fail(c, http.StatusBadGateway, "AI 回答失败："+err.Error())
		return
	}
	raw, _ := json.Marshal(cites)
	rec.Answer, rec.Citations = answer, string(raw)
	b.core.Gorm().Create(&rec)
	b.core.OK(c, toAskView(rec))
}

// MyAsks GET /qa/books/:id/asks?page= 我在本书的 AI 问答记录。
func (b *behavior) MyAsks(c *gin.Context) {
	book, found := b.readableBook(c)
	if !found {
		return
	}
	page, pageSize := b.core.Paginate(c)
	q := b.core.Gorm().Model(&Ask{}).Where("book_id = ? AND user_id = ? AND status = ?", book.ID, b.core.CurrentUser(c).ID, "done")
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
		if b.core.Gorm().Where("id = ? AND user_id = ? AND book_id = ?", req.AskID, u.ID, book.ID).First(&ask).Error == nil {
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
