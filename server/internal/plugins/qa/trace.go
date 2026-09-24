package qa

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"time"

	"knowforge/server/internal/ai"
)

// 调用链：一次问答从检索到作答的每一步（划词上下文、向量化查询、检索命中、每次模型调用及其请求的工具、每次工具执行），
// 按发生顺序记录并随步骤实时写入问答记录，读者可在回答下查看完整链条。

// TraceHit 检索/工具返回的一个小节。
type TraceHit struct {
	N        int    `json:"n"` // 出处编号（回答中的 [n]）
	DocTitle string `json:"doc_title"`
	Heading  string `json:"heading"`
}

// TraceToolCall 模型在一次调用中请求执行的工具。
type TraceToolCall struct {
	Name string `json:"name"`
	Args string `json:"args"`
}

// TraceStep 调用链中的一步。
type TraceStep struct {
	Type       string `json:"type"` // context | embed | retrieve | model | tool
	StartMs    int64  `json:"start_ms"`
	DurationMs int64  `json:"duration_ms"`
	// model / embed
	Model        string          `json:"model,omitempty"`
	InputTokens  int64           `json:"input_tokens,omitempty"`
	OutputTokens int64           `json:"output_tokens,omitempty"`
	Estimated    bool            `json:"estimated,omitempty"`
	ToolCalls    []TraceToolCall `json:"tool_calls,omitempty"`
	Output       string          `json:"output,omitempty"` // 中间轮次模型附带的文字（截断）
	// retrieve / tool / context
	Name  string     `json:"name,omitempty"`
	Args  string     `json:"args,omitempty"`
	Query string     `json:"query,omitempty"`
	Mode  string     `json:"mode,omitempty"` // hybrid | keyword
	Hits  []TraceHit `json:"hits,omitempty"`
	Note  string     `json:"note,omitempty"`
	Error string     `json:"error,omitempty"`
}

// traceTotals 调用链合计：模型对话次数、tokens（含向量化）、是否含估算。
type traceTotals struct {
	Calls        int
	InputTokens  int64
	OutputTokens int64
	Estimated    bool
}

type tracer struct {
	mu       sync.Mutex
	start    time.Time
	steps    []TraceStep
	onChange func(steps []TraceStep, totals traceTotals)
}

func newTracer(onChange func([]TraceStep, traceTotals)) *tracer {
	return &tracer{start: time.Now(), onChange: onChange}
}

// begin 返回步骤起点（相对调用链开始的毫秒数）与计时起点。
func (t *tracer) begin() (int64, time.Time) {
	if t == nil {
		return 0, time.Now()
	}
	return time.Since(t.start).Milliseconds(), time.Now()
}

// add 追加一步并通知持久化（nil 安全）。
func (t *tracer) add(step TraceStep, startMs int64, started time.Time) {
	if t == nil {
		return
	}
	step.StartMs, step.DurationMs = startMs, time.Since(started).Milliseconds()
	t.mu.Lock()
	t.steps = append(t.steps, step)
	steps := append([]TraceStep(nil), t.steps...)
	t.mu.Unlock()
	if t.onChange != nil {
		t.onChange(steps, totalsOf(steps))
	}
}

func totalsOf(steps []TraceStep) traceTotals {
	var out traceTotals
	for _, s := range steps {
		if s.Type == "model" {
			out.Calls++
		}
		out.InputTokens += s.InputTokens
		out.OutputTokens += s.OutputTokens
		out.Estimated = out.Estimated || s.Estimated
	}
	return out
}

func encodeTrace(steps []TraceStep) string {
	raw, _ := json.Marshal(steps)
	return string(raw)
}

func hitsOf(src *sources, chunks []Chunk) []TraceHit {
	out := make([]TraceHit, 0, len(chunks))
	for _, c := range chunks {
		out = append(out, TraceHit{N: src.add(c), DocTitle: c.DocTitle, Heading: c.Heading})
	}
	return out
}

// userError 展示给读者的错误（不透出 AI 服务的原始报错，详情见管理端 AI 用量）。
func userError(err error) string {
	switch {
	case errors.Is(err, ai.ErrQuotaExceeded):
		return err.Error()
	case errors.Is(err, context.Canceled):
		return "已取消"
	default:
		return "AI 服务暂时不可用，请稍后再试"
	}
}
