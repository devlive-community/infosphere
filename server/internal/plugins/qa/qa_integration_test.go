package qa_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"gorm.io/gorm"

	"knowforge/server/internal/app"
	"knowforge/server/internal/auth"
	"knowforge/server/internal/config"
	"knowforge/server/internal/models"
	"knowforge/server/internal/plugins/qa"
)

// 集成测试（经 HTTP，AI 服务用本地假服务器模拟 OpenAI 兼容接口）：索引与向量化、标准问答出处、划词提问、Agent 工具调用、每日额度、社区问答。

type fakeAI struct {
	mu      sync.Mutex
	prompts []string // 每次对话请求中最后一条 user 消息
	embeds  int
}

func (f *fakeAI) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/embeddings", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Input []string `json:"input"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		f.mu.Lock()
		f.embeds += len(req.Input)
		f.mu.Unlock()
		items := []map[string]any{}
		for i, text := range req.Input {
			// 按关键词构造的确定性向量
			items = append(items, map[string]any{"index": i, "embedding": []float32{
				float32(strings.Count(text, "缓存")), float32(strings.Count(text, "索引")), 0.1,
			}})
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": items})
	})
	mux.HandleFunc("/v1/chat/completions", func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var req struct {
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
			Tools []any `json:"tools"`
		}
		_ = json.Unmarshal(raw, &req)
		hasTool, lastUser := false, ""
		for _, m := range req.Messages {
			if m.Role == "tool" {
				hasTool = true
			}
			if m.Role == "user" {
				lastUser = m.Content
			}
		}
		f.mu.Lock()
		f.prompts = append(f.prompts, lastUser)
		f.mu.Unlock()
		msg := map[string]any{"role": "assistant", "content": "缓存用于加速读取 [1]。"}
		if len(req.Tools) > 0 && !hasTool {
			msg = map[string]any{"role": "assistant", "content": "", "tool_calls": []map[string]any{{
				"id": "call_1", "type": "function", "function": map[string]any{"name": "search_book", "arguments": `{"query":"索引"}`},
			}}}
		} else if hasTool {
			msg["content"] = "索引帮助检索 [1]。"
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []map[string]any{{"message": msg}}})
	})
	return mux
}

func (f *fakeAI) lastPrompt() string {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.prompts) == 0 {
		return ""
	}
	return f.prompts[len(f.prompts)-1]
}

type testEnv struct {
	app    *app.App
	db     *gorm.DB
	token  string
	server *httptest.Server
	client *http.Client
}

func newTestEnv(t *testing.T, aiURL string) *testEnv {
	t.Helper()
	t.Setenv("KNOWFORGE_DATA", t.TempDir())
	cfg, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	a, err := app.New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	e := &testEnv{app: a, server: httptest.NewServer(a.Router()), client: &http.Client{Timeout: 10 * time.Second}}
	t.Cleanup(e.server.Close)
	status, installed := e.req(t, "", http.MethodPost, "/api/v1/setup/install", `{"database":{"type":"sqlite"},"site":{"name":"问答测试"},"admin":{"username":"qa-admin","email":"qa-admin@test.local","password":"secret123"}}`)
	if status != http.StatusOK {
		t.Fatalf("安装失败: %d %v", status, installed)
	}
	e.token = installed["data"].(map[string]any)["token"].(string)
	e.db = a.DB
	if status, p := e.req(t, e.token, http.MethodPost, "/api/v1/admin/plugins/qa/install", ""); status != http.StatusOK {
		t.Fatalf("启用问答插件失败: %d %v", status, p)
	}
	body := fmt.Sprintf(`{"provider":"openai","base_url":%q,"api_key":"test-key","model":"fake","embed_model":"fake-embed"}`, aiURL+"/v1")
	if status, p := e.req(t, e.token, http.MethodPut, "/api/v1/admin/ai", body); status != http.StatusOK || data(p)["chat_available"] != true || data(p)["embed_available"] != true {
		t.Fatalf("配置 AI 服务失败: %d %v", status, p)
	}
	return e
}

func (e *testEnv) req(t *testing.T, token, method, path, body string) (int, map[string]any) {
	t.Helper()
	r, _ := http.NewRequest(method, e.server.URL+path, bytes.NewReader([]byte(body)))
	r.Header.Set("Content-Type", "application/json")
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := e.client.Do(r)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	p := map[string]any{}
	_ = json.NewDecoder(resp.Body).Decode(&p)
	return resp.StatusCode, p
}

func (e *testEnv) as(t *testing.T, u *models.User, method, path, body string) (int, map[string]any) {
	t.Helper()
	token, _ := auth.GenerateToken(e.app.Config.Secret, u.ID, u.Username, u.Role)
	return e.req(t, token, method, path, body)
}

func (e *testEnv) user(t *testing.T, name string) *models.User {
	t.Helper()
	u := &models.User{Username: name, Email: name + "@test.local", Role: "user", IsActive: true, EmailVerified: true}
	if err := e.db.Create(u).Error; err != nil {
		t.Fatal(err)
	}
	return u
}

func (e *testEnv) runJobs(t *testing.T) {
	t.Helper()
	for i := 0; i < 20; i++ {
		ran, err := e.app.Jobs.RunOnce(context.Background())
		if err != nil {
			t.Fatalf("任务失败: %v", err)
		}
		if !ran {
			return
		}
	}
}

func data(p map[string]any) map[string]any { d, _ := p["data"].(map[string]any); return d }

func TestQAFlow(t *testing.T) {
	fake := &fakeAI{}
	aiServer := httptest.NewServer(fake.handler())
	t.Cleanup(aiServer.Close)
	e := newTestEnv(t, aiServer.URL)
	author, reader, helper := e.user(t, "author"), e.user(t, "reader"), e.user(t, "helper")

	_, created := e.as(t, author, http.MethodPost, "/api/v1/books", `{"title":"存储原理","status":"published","is_public":true}`)
	bookID := uint(data(created)["id"].(float64))
	base := fmt.Sprintf("/api/v1/qa/books/%d", bookID)
	content := "开篇介绍。\n\n## 缓存\n\n缓存可以加速读取，热点数据放在内存中。\n\n```\n# 代码里的井号不是标题\n```\n\n## 索引 `B+ 树`\n\n索引帮助检索，数据库常用 B+ 树。"
	_, d := e.as(t, author, http.MethodPost, fmt.Sprintf("/api/v1/books/%d/documents", bookID), fmt.Sprintf(`{"title":"第一章","content":%q,"status":"published"}`, content))
	docID := uint(data(d)["id"].(float64))
	docSlug := data(d)["slug"].(string)
	e.as(t, author, http.MethodPost, fmt.Sprintf("/api/v1/books/%d/documents", bookID), `{"title":"草稿","content":"草稿里的缓存机密","status":"draft"}`)

	// 状态：AI 可用、默认每日额度 20
	status, st := e.as(t, reader, http.MethodGet, base+"/status", "")
	if status != http.StatusOK || data(st)["ai_available"] != true || data(st)["agent_available"] != true {
		t.Fatalf("状态异常: %d %v", status, st)
	}
	if q := data(st)["quota"].(map[string]any); q["used"].(float64) != 0 || q["limit"].(float64) != 20 {
		t.Fatalf("额度异常: %v", q)
	}

	// 标准问答：出处指向小节锚点；草稿不进入索引
	status, ask := e.as(t, reader, http.MethodPost, base+"/ask", `{"question":"缓存有什么用？"}`)
	if status != http.StatusOK {
		t.Fatalf("提问失败: %d %v", status, ask)
	}
	cites := data(ask)["citations"].([]any)
	if len(cites) != 1 || cites[0].(map[string]any)["anchor"] != "h-1" || cites[0].(map[string]any)["doc_slug"] != docSlug || cites[0].(map[string]any)["heading"] != "缓存" {
		t.Fatalf("出处异常: %v", cites)
	}
	if p := fake.lastPrompt(); !strings.Contains(p, "缓存可以加速读取") || strings.Contains(p, "机密") {
		t.Fatalf("检索片段异常: %s", p)
	}
	askID := uint(data(ask)["id"].(float64))

	// 后台向量化
	e.runJobs(t)
	var state qa.IndexState
	e.db.First(&state, bookID)
	if state.Chunks != 3 || state.Embedded != 3 || fake.embeds < 3 {
		t.Fatalf("索引状态异常: %+v embeds=%d", state, fake.embeds)
	}
	// 内容未变化时不重建、不重复向量化
	before := fake.embeds
	e.as(t, reader, http.MethodPost, base+"/ask", `{"question":"索引是什么"}`)
	e.runJobs(t)
	if fake.embeds != before+1 { // 仅查询向量
		t.Fatalf("不应重新向量化: %d -> %d", before, fake.embeds)
	}

	// 划词提问：包含选中文字的小节优先加入
	status, sel := e.as(t, reader, http.MethodPost, base+"/ask", fmt.Sprintf(`{"selection":"数据库常用 B+ 树","doc_id":%d}`, docID))
	if status != http.StatusOK || data(sel)["question"] != "请解释这段内容" {
		t.Fatalf("划词提问失败: %d %v", status, sel)
	}
	if p := fake.lastPrompt(); !strings.Contains(p, "「数据库常用 B+ 树」") || !strings.Contains(p, "[1] 第一章 › 索引 B+ 树") {
		t.Fatalf("划词片段异常: %s", p)
	}

	// Agent 模式：调用 search_book 后作答
	status, ag := e.as(t, reader, http.MethodPost, base+"/ask", `{"question":"索引怎么实现？","mode":"agent"}`)
	if status != http.StatusOK || data(ag)["steps"].(float64) != 1 || data(ag)["mode"] != "agent" {
		t.Fatalf("Agent 问答失败: %d %v", status, ag)
	}
	if c := data(ag)["citations"].([]any); len(c) == 0 || c[0].(map[string]any)["anchor"] != "h-2" {
		t.Fatalf("Agent 出处异常: %v", c)
	}

	// 每日额度
	if err := e.app.SetSetting("qa_ai_daily", "4", ""); err != nil {
		t.Fatal(err)
	}
	if status, p := e.as(t, reader, http.MethodPost, base+"/ask", `{"question":"再问一次"}`); status != http.StatusTooManyRequests {
		t.Fatalf("超出额度应 429: %d %v", status, p)
	}
	_, hist := e.as(t, reader, http.MethodGet, base+"/asks", "")
	if data(hist)["total"].(float64) != 4 {
		t.Fatalf("问答记录异常: %v", hist)
	}

	// 管理员关闭 Agent 模式
	e.req(t, e.token, http.MethodPut, "/api/v1/admin/qa/settings", `{"agent_enabled":false}`)
	e.app.SetSetting("qa_ai_daily", "100", "")
	if status, _ := e.as(t, reader, http.MethodPost, base+"/ask", `{"question":"x","mode":"agent"}`); status != http.StatusBadRequest {
		t.Fatalf("关闭 Agent 后应拒绝: %d", status)
	}
	if status, p := e.req(t, e.token, http.MethodPut, "/api/v1/admin/qa/settings", `{"top_k":20}`); status != http.StatusBadRequest {
		t.Fatalf("top_k 越界应拒绝: %d %v", status, p)
	}

	// 重建索引仅作者可用
	if status, _ := e.as(t, reader, http.MethodPost, base+"/reindex", ""); status != http.StatusForbidden {
		t.Fatalf("读者不能重建索引: %d", status)
	}
	if status, p := e.as(t, author, http.MethodPost, base+"/reindex", ""); status != http.StatusOK || data(p)["chunks"].(float64) != 3 {
		t.Fatalf("重建索引失败: %d %v", status, p)
	}

	// 社区问答：附带 AI 回答提问 → 作者收到通知 → 他人回答 → 提问者采纳
	status, q := e.as(t, reader, http.MethodPost, base+"/questions", fmt.Sprintf(`{"title":"缓存和索引的区别？","ask_id":%d}`, askID))
	if status != http.StatusOK || data(q)["ai_answer"] != "缓存用于加速读取 [1]。" || len(data(q)["ai_citations"].([]any)) != 1 {
		t.Fatalf("提问失败: %d %v", status, q)
	}
	qid := uint(data(q)["id"].(float64))
	var notes int64
	e.db.Model(&models.Notification{}).Where("user_id = ?", author.ID).Count(&notes)
	if notes != 1 {
		t.Fatalf("作者应收到提问通知: %d", notes)
	}
	status, ans := e.as(t, helper, http.MethodPost, fmt.Sprintf("/api/v1/qa/questions/%d/answers", qid), `{"body":"缓存提速，索引加速查找。"}`)
	if status != http.StatusOK {
		t.Fatalf("回答失败: %d %v", status, ans)
	}
	aid := uint(data(ans)["id"].(float64))
	if status, _ := e.as(t, helper, http.MethodPost, fmt.Sprintf("/api/v1/qa/answers/%d/accept", aid), ""); status != http.StatusForbidden {
		t.Fatalf("回答者不能采纳自己的回答: %d", status)
	}
	if status, p := e.as(t, reader, http.MethodPost, fmt.Sprintf("/api/v1/qa/answers/%d/accept", aid), ""); status != http.StatusOK || data(p)["status"] != "resolved" {
		t.Fatalf("采纳失败: %d %v", status, p)
	}
	_, list := e.req(t, "", http.MethodGet, base+"/questions?filter=resolved", "")
	if data(list)["total"].(float64) != 1 {
		t.Fatalf("已解决列表异常: %v", list)
	}
	_, detail := e.req(t, "", http.MethodGet, fmt.Sprintf("/api/v1/qa/questions/%d", qid), "")
	if answers := data(detail)["answers"].([]any); len(answers) != 1 || answers[0].(map[string]any)["accepted"] != true {
		t.Fatalf("问题详情异常: %v", detail)
	}
	e.db.Model(&models.Notification{}).Where("user_id IN ?", []uint{reader.ID, helper.ID}).Count(&notes)
	if notes != 2 {
		t.Fatalf("回答/采纳通知异常: %d", notes)
	}
	// 删除被采纳的回答：问题回到待解决
	if status, _ := e.as(t, reader, http.MethodDelete, fmt.Sprintf("/api/v1/qa/answers/%d", aid), ""); status != http.StatusForbidden {
		t.Fatalf("提问者不能删除他人回答: %d", status)
	}
	e.as(t, author, http.MethodDelete, fmt.Sprintf("/api/v1/qa/answers/%d", aid), "")
	var after qa.Question
	e.db.First(&after, qid)
	if after.Status != "open" || after.AnswerCount != 0 || after.AcceptedAnswerID != 0 {
		t.Fatalf("删除回答后状态异常: %+v", after)
	}
	if status, _ := e.as(t, helper, http.MethodDelete, fmt.Sprintf("/api/v1/qa/questions/%d", qid), ""); status != http.StatusForbidden {
		t.Fatalf("他人不能删除问题: %d", status)
	}
	if status, _ := e.as(t, reader, http.MethodDelete, fmt.Sprintf("/api/v1/qa/questions/%d", qid), ""); status != http.StatusOK {
		t.Fatalf("提问者删除问题失败: %d", status)
	}
}

func TestQAPrivateBookHidden(t *testing.T) {
	fake := &fakeAI{}
	aiServer := httptest.NewServer(fake.handler())
	t.Cleanup(aiServer.Close)
	e := newTestEnv(t, aiServer.URL)
	author, stranger := e.user(t, "author"), e.user(t, "stranger")
	_, created := e.as(t, author, http.MethodPost, "/api/v1/books", `{"title":"私密书","status":"published","is_public":false}`)
	bookID := uint(data(created)["id"].(float64))
	if status, _ := e.as(t, stranger, http.MethodPost, fmt.Sprintf("/api/v1/qa/books/%d/ask", bookID), `{"question":"内容？"}`); status != http.StatusNotFound {
		t.Fatalf("私密书籍不应可问: %d", status)
	}
	if status, _ := e.req(t, "", http.MethodGet, fmt.Sprintf("/api/v1/qa/books/%d/questions", bookID), ""); status != http.StatusNotFound {
		t.Fatalf("私密书籍问题列表不应可见: %d", status)
	}
}
