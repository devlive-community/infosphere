package qa

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"knowforge/server/internal/ai"
	"knowforge/server/internal/models"
)

// 作答：标准模式（检索 → 片段 → 回答）与 Agent 模式（模型用工具多步检索/阅读后回答），回答中的 [n] 映射为出处。
// 不限制总时长与轮数：Agent 模式直到模型不再调用工具为止；可由读者取消，并受每月 AI 用量权益约束。每一步都写入调用链。

const (
	snippetRunes   = 160
	toolSnippet    = 300
	selectionHints = 2 // 划词提问时优先加入包含选中文字的小节数
)

const noContentAnswer = "书中没有找到与这个问题相关的内容，可以换个说法再问，或在社区问答中向作者和其他读者提问。"

var citationRef = regexp.MustCompile(`\[(\d{1,3})\]`)

// sources 回答可引用的片段（编号从 1 开始）。
type sources struct {
	list  []Chunk
	index map[uint]int // chunk ID → 编号
}

func newSources() *sources { return &sources{index: map[uint]int{}} }

func (s *sources) add(c Chunk) int {
	if n, ok := s.index[c.ID]; ok {
		return n
	}
	s.list = append(s.list, c)
	s.index[c.ID] = len(s.list)
	return len(s.list)
}

var (
	mdImage     = regexp.MustCompile(`!\[[^\]]*\]\([^)]*\)`)
	mdLinePfx   = regexp.MustCompile(`(?m)^\s*(#{1,6}|>|[-*+]|\d+\.)\s+`)
	mdFence     = regexp.MustCompile("(?m)^\\s*```.*$")
	spaceCollap = regexp.MustCompile(`\s+`)
)

// plainSnippet 出处摘要：去掉 Markdown 语法（图片、链接地址、强调、标题/列表/引用前缀）并压缩空白。
func plainSnippet(md string, n int) string {
	s := mdImage.ReplaceAllString(md, "")
	s = mdLink.ReplaceAllString(s, "$1")
	s = mdFence.ReplaceAllString(s, "")
	s = mdLinePfx.ReplaceAllString(s, "")
	s = mdDecoration.ReplaceAllString(s, "")
	return truncate(strings.TrimSpace(spaceCollap.ReplaceAllString(s, " ")), n)
}

func label(c Chunk) string {
	if c.Heading != "" {
		return c.DocTitle + " › " + c.Heading
	}
	return c.DocTitle
}

// citations 从回答中提取被引用的片段（按首次出现顺序）；未标注引用时给出前三个相关片段。
func (s *sources) citations(answer string) []Citation {
	out := []Citation{}
	seen := map[int]bool{}
	add := func(n int) {
		if n < 1 || n > len(s.list) || seen[n] {
			return
		}
		seen[n] = true
		c := s.list[n-1]
		out = append(out, Citation{N: n, DocID: c.DocID, DocSlug: c.DocSlug, DocTitle: c.DocTitle, Heading: c.Heading, Anchor: c.Anchor, Snippet: plainSnippet(c.Content, snippetRunes)})
	}
	for _, m := range citationRef.FindAllStringSubmatch(answer, -1) {
		n, _ := strconv.Atoi(m[1])
		add(n)
	}
	if len(out) == 0 {
		for n := 1; n <= len(s.list) && n <= 3; n++ {
			add(n)
		}
	}
	return out
}

func systemPrompt(book *models.Book, agent bool) string {
	base := fmt.Sprintf("你是《%s》的专业问答助手，帮助读者快速、准确地理解这本书。\n"+
		"规则：\n"+
		"1. 只能依据提供给你的书籍片段作答，不要使用片段之外的知识编造内容；片段不足以回答时，明确说明书中没有找到相关内容。\n"+
		"2. 每个关键结论后用 [编号] 标注出处，编号取自片段前的方括号编号，可同时引用多个，如 [1][3]。\n"+
		"3. 使用与读者提问相同的语言回答，简洁清晰，必要时使用 Markdown 列表或代码块。", book.Title)
	if agent {
		base += "\n4. 你可以调用工具：search_book 检索全书、read_section 阅读某个小节全文、get_toc 查看目录。先检索再作答，必要时多次检索或阅读不同小节，信息足够后再给出最终回答。只引用工具结果中出现过的编号。"
	}
	return base
}

func questionText(question, selection string) string {
	q := "读者的问题：" + question
	if selection != "" {
		q += "\n\n读者在阅读时选中的文字：\n「" + selection + "」"
	}
	return q
}

// selectionChunks 划词提问：所在章节中包含选中文字的小节（找不到时取该章节开头）。
func selectionChunks(chunks []Chunk, docID uint, selection string) []Chunk {
	if docID == 0 {
		return nil
	}
	probe := strings.TrimSpace(truncate(selection, 30))
	var inDoc, hits []Chunk
	for _, c := range chunks {
		if c.DocID != docID {
			continue
		}
		inDoc = append(inDoc, c)
		if probe != "" && strings.Contains(c.Content, probe) && len(hits) < selectionHints {
			hits = append(hits, c)
		}
	}
	if len(hits) == 0 && len(inDoc) > 0 {
		hits = append(hits, inDoc[0])
	}
	return hits
}

// answerResult 一次作答的结果（消耗见调用链合计）。
type answerResult struct {
	Answer    string
	Citations []Citation
	Steps     int // Agent 工具调用次数
}

// chat 调用模型并把本次调用记入调用链（模型、tokens、耗时、请求的工具）。后台问答时以流式接口调用，
// 生成的文本逐段推送给读者；本轮以工具调用结束时清空临时文本。
func (b *behavior) chat(ctx context.Context, tr *tracer, req ai.ChatRequest) (ai.ChatResponse, error) {
	startMs, started := tr.begin()
	var (
		res ai.ChatResponse
		err error
	)
	if st := runFrom(ctx); st != nil {
		res, err = b.core.AIChatStream(ctx, req, st.append)
		if err == nil && len(res.ToolCalls) > 0 {
			st.reset()
		}
	} else {
		res, err = b.core.AIChat(ctx, req)
	}
	step := TraceStep{Type: "model", Model: res.Model, InputTokens: res.Usage.InputTokens, OutputTokens: res.Usage.OutputTokens, Estimated: res.Usage.Estimated}
	if err != nil {
		step.Error = userError(err)
	}
	for _, tc := range res.ToolCalls {
		step.ToolCalls = append(step.ToolCalls, TraceToolCall{Name: tc.Name, Args: truncate(string(tc.Arguments), 300)})
	}
	if len(res.ToolCalls) > 0 {
		step.Output = truncate(res.Content, 300)
	}
	tr.add(step, startMs, started)
	return res, err
}

// contextHints 划词提问：记录所在章节中定位到的小节。
func contextHints(tr *tracer, src *sources, chunks []Chunk, docID uint, selection string) []Chunk {
	startMs, started := tr.begin()
	hints := selectionChunks(chunks, docID, selection)
	if len(hints) > 0 {
		tr.add(TraceStep{Type: "context", Query: truncate(selection, 200), Hits: hitsOf(src, hints)}, startMs, started)
	}
	return hints
}

// answerRAG 标准模式：检索相关片段后一次作答。
func (b *behavior) answerRAG(ctx context.Context, tr *tracer, book *models.Book, chunks []Chunk, question, selection string, docID uint, topK int) (answerResult, error) {
	src := newSources()
	contextHints(tr, src, chunks, docID, selection)
	query := strings.TrimSpace(question + " " + selection)
	startMs, started := tr.begin()
	hits, mode := b.search(ctx, tr, chunks, query, topK)
	tr.add(TraceStep{Type: "retrieve", Query: truncate(query, 200), Mode: mode, Hits: hitsOf(src, hits)}, startMs, started)
	if len(src.list) == 0 {
		return answerResult{Answer: noContentAnswer, Citations: []Citation{}}, nil
	}
	var sb strings.Builder
	sb.WriteString(questionText(question, selection))
	sb.WriteString("\n\n书籍片段：")
	for i, c := range src.list {
		fmt.Fprintf(&sb, "\n\n[%d] %s\n%s", i+1, label(c), c.Content)
	}
	res, err := b.chat(ctx, tr, ai.ChatRequest{System: systemPrompt(book, false), Messages: []ai.Message{{Role: "user", Content: sb.String()}}, MaxTokens: 1500, Temperature: 0.2})
	if err != nil {
		return answerResult{}, err
	}
	return answerResult{Answer: res.Content, Citations: src.citations(res.Content)}, nil
}

var agentTools = []ai.Tool{
	{Name: "search_book", Description: "在整本书中检索与查询最相关的小节，返回编号、所在章节与摘要。", Parameters: map[string]any{
		"type": "object", "properties": map[string]any{
			"query": map[string]any{"type": "string", "description": "检索关键词或问题"},
			"top_k": map[string]any{"type": "integer", "description": "返回数量，默认 5，最多 8"},
		}, "required": []string{"query"},
	}},
	{Name: "read_section", Description: "阅读某个小节的全文（参数为 search_book 或 get_toc 返回的 id）。", Parameters: map[string]any{
		"type": "object", "properties": map[string]any{"id": map[string]any{"type": "integer", "description": "小节 id"}}, "required": []string{"id"},
	}},
	{Name: "get_toc", Description: "查看全书目录（章节与其中的小节及 id）。", Parameters: map[string]any{"type": "object", "properties": map[string]any{}}},
}

// answerAgent Agent 模式：模型调用工具多步检索与阅读后作答，直到模型不再调用工具（不限轮数）。
// 与之前完全相同的工具调用不重复执行，直接提示模型基于已有结果继续，避免原地打转。
func (b *behavior) answerAgent(ctx context.Context, tr *tracer, book *models.Book, chunks []Chunk, question, selection string, docID uint) (answerResult, error) {
	src := newSources()
	byID := map[uint]Chunk{}
	for _, c := range chunks {
		byID[c.ID] = c
	}
	messages := []ai.Message{{Role: "user", Content: questionText(question, selection)}}
	if hints := contextHints(tr, src, chunks, docID, selection); len(hints) > 0 {
		var sb strings.Builder
		sb.WriteString("读者当前所在章节的相关小节（可直接引用）：")
		for _, c := range hints {
			fmt.Fprintf(&sb, "\n\n[%d] %s (id=%d)\n%s", src.add(c), label(c), c.ID, c.Content)
		}
		messages[0].Content += "\n\n" + sb.String()
	}
	out := answerResult{}
	seen := map[string]int{} // 工具名+参数 → 首次执行的步骤序号
	for {
		res, err := b.chat(ctx, tr, ai.ChatRequest{System: systemPrompt(book, true), Messages: messages, Tools: agentTools, MaxTokens: 1500, Temperature: 0.2})
		if err != nil {
			return out, err
		}
		if len(res.ToolCalls) == 0 {
			out.Answer, out.Citations = res.Content, src.citations(res.Content)
			return out, nil
		}
		messages = append(messages, ai.Message{Role: "assistant", Content: res.Content, ToolCalls: res.ToolCalls})
		for _, call := range res.ToolCalls {
			out.Steps++
			key := call.Name + "\x00" + string(call.Arguments)
			var result string
			if first, dup := seen[key]; dup {
				startMs, started := tr.begin()
				result = fmt.Sprintf("与第 %d 次工具调用完全相同，结果同上。请基于已获得的信息作答，或换用其他查询。", first)
				tr.add(TraceStep{Type: "tool", Name: call.Name, Args: truncate(string(call.Arguments), 300), Note: "duplicate"}, startMs, started)
			} else {
				seen[key] = out.Steps
				result = b.runTool(ctx, tr, call, chunks, byID, src)
			}
			messages = append(messages, ai.Message{Role: "tool", ToolCallID: call.ID, Content: result})
		}
	}
}

func (b *behavior) runTool(ctx context.Context, tr *tracer, call ai.ToolCall, chunks []Chunk, byID map[uint]Chunk, src *sources) string {
	var args struct {
		Query string `json:"query"`
		TopK  int    `json:"top_k"`
		ID    uint   `json:"id"`
	}
	_ = json.Unmarshal(call.Arguments, &args)
	startMs, started := tr.begin()
	step := TraceStep{Type: "tool", Name: call.Name, Args: truncate(string(call.Arguments), 300)}
	defer func() { tr.add(step, startMs, started) }()
	switch call.Name {
	case "search_book":
		k := args.TopK
		if k <= 0 || k > 8 {
			k = 5
		}
		hits, mode := b.search(ctx, tr, chunks, args.Query, k)
		step.Query, step.Mode, step.Hits = truncate(args.Query, 200), mode, hitsOf(src, hits)
		if len(hits) == 0 {
			step.Note = "not_found"
			return "没有找到相关内容。"
		}
		var sb strings.Builder
		for _, c := range hits {
			fmt.Fprintf(&sb, "[%d] %s (id=%d)\n%s\n\n", src.add(c), label(c), c.ID, truncate(c.Content, toolSnippet))
		}
		return sb.String()
	case "read_section":
		c, ok := byID[args.ID]
		if !ok {
			step.Note = "not_found"
			return "没有这个小节（id 无效或无权阅读）。"
		}
		step.Hits = hitsOf(src, []Chunk{c})
		return fmt.Sprintf("[%d] %s\n%s", src.add(c), label(c), c.Content)
	case "get_toc":
		var sb strings.Builder
		lastDoc := uint(0)
		for _, c := range chunks {
			if c.DocID != lastDoc {
				fmt.Fprintf(&sb, "\n%s\n", c.DocTitle)
				lastDoc = c.DocID
			}
			if c.Heading != "" {
				fmt.Fprintf(&sb, "  - %s (id=%d)\n", c.Heading, c.ID)
			} else {
				fmt.Fprintf(&sb, "  - （开头）(id=%d)\n", c.ID)
			}
		}
		step.Note = "toc"
		return truncate(sb.String(), 6000)
	}
	step.Note = "unknown_tool"
	return "未知工具。"
}
