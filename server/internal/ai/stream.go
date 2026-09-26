package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
)

// 流式对话：逐段回调生成的文本（onDelta），结束时返回与 Chat 相同的完整结果（含工具调用与用量）。
// OpenAI 兼容接口以 stream + stream_options.include_usage 取得用量（服务不支持 stream_options 时去掉重试一次）；
// Anthropic 以 SSE 事件流（message_start / content_block_* / message_delta）拼装文本、工具调用与用量。

// ChatStream 调用对话服务并流式回调文本片段。
func ChatStream(ctx context.Context, cfg Config, req ChatRequest, onDelta func(text string)) (ChatResponse, error) {
	if !cfg.ChatAvailable() {
		return ChatResponse{}, errors.New("尚未配置 AI 服务")
	}
	if req.MaxTokens <= 0 {
		req.MaxTokens = 2048
	}
	if onDelta == nil {
		onDelta = func(string) {}
	}
	if cfg.Provider == ProviderAnthropic {
		return streamAnthropic(ctx, cfg, req, onDelta)
	}
	res, err := streamOpenAI(ctx, cfg, req, onDelta, true)
	var se *statusError
	if errors.As(err, &se) && se.status == http.StatusBadRequest && strings.Contains(se.body, "stream_options") {
		return streamOpenAI(ctx, cfg, req, onDelta, false)
	}
	return res, err
}

type statusError struct {
	status int
	body   string
}

func (e *statusError) Error() string { return fmt.Sprintf("AI 服务返回 %d: %s", e.status, e.body) }

// postStream 发起流式请求，返回响应体（调用方负责关闭）。
func postStream(ctx context.Context, url string, headers map[string]string, payload any) (io.ReadCloser, error) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	for k, v := range headers {
		if v != "" {
			req.Header.Set(k, v)
		}
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("调用 AI 服务失败: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		data, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		resp.Body.Close()
		msg := strings.TrimSpace(string(data))
		if len(msg) > 300 {
			msg = msg[:300]
		}
		return nil, &statusError{status: resp.StatusCode, body: msg}
	}
	return resp.Body, nil
}

// readSSE 逐条读取 SSE 事件（event 名与 data 内容）；handle 返回 false 时停止。
func readSSE(body io.Reader, handle func(event, data string) bool) error {
	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 64*1024), 4<<20)
	event, data := "", []string{}
	flush := func() bool {
		if len(data) == 0 {
			event = ""
			return true
		}
		ok := handle(event, strings.Join(data, "\n"))
		event, data = "", data[:0]
		return ok
	}
	for scanner.Scan() {
		line := scanner.Text()
		switch {
		case line == "":
			if !flush() {
				return nil
			}
		case strings.HasPrefix(line, ":"):
		case strings.HasPrefix(line, "event:"):
			event = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
		case strings.HasPrefix(line, "data:"):
			data = append(data, strings.TrimPrefix(strings.TrimPrefix(line, "data:"), " "))
		}
	}
	if err := scanner.Err(); err != nil {
		return err
	}
	flush()
	return nil
}

// —— OpenAI 兼容 ——

func streamOpenAI(ctx context.Context, cfg Config, req ChatRequest, onDelta func(string), withUsage bool) (ChatResponse, error) {
	base, model, payload := openAIPayload(cfg, req)
	payload["stream"] = true
	if withUsage {
		payload["stream_options"] = map[string]any{"include_usage": true}
	}
	body, err := postStream(ctx, base+"/chat/completions", map[string]string{"Authorization": bearer(cfg.APIKey)}, payload)
	if err != nil {
		return ChatResponse{}, err
	}
	defer body.Close()
	type toolDelta struct {
		Index    int    `json:"index"`
		ID       string `json:"id"`
		Function struct {
			Name      string `json:"name"`
			Arguments string `json:"arguments"`
		} `json:"function"`
	}
	var (
		text    strings.Builder
		calls   = map[int]*ToolCall{}
		args    = map[int]*strings.Builder{}
		usage   Usage
		gotUse  bool
		model2  string
		streamE error
	)
	err = readSSE(body, func(_, data string) bool {
		if data == "[DONE]" {
			return false
		}
		var chunk struct {
			Model string `json:"model"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
			Usage *struct {
				PromptTokens     int64 `json:"prompt_tokens"`
				CompletionTokens int64 `json:"completion_tokens"`
			} `json:"usage"`
			Choices []struct {
				Delta struct {
					Content   string      `json:"content"`
					ToolCalls []toolDelta `json:"tool_calls"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if json.Unmarshal([]byte(data), &chunk) != nil {
			return true
		}
		if chunk.Error != nil {
			streamE = errors.New("AI 服务返回错误：" + chunk.Error.Message)
			return false
		}
		if chunk.Model != "" {
			model2 = chunk.Model
		}
		if chunk.Usage != nil {
			usage, gotUse = Usage{InputTokens: chunk.Usage.PromptTokens, OutputTokens: chunk.Usage.CompletionTokens}, true
		}
		for _, ch := range chunk.Choices {
			if ch.Delta.Content != "" {
				text.WriteString(ch.Delta.Content)
				onDelta(ch.Delta.Content)
			}
			for _, tc := range ch.Delta.ToolCalls {
				c := calls[tc.Index]
				if c == nil {
					c = &ToolCall{}
					calls[tc.Index], args[tc.Index] = c, &strings.Builder{}
				}
				if tc.ID != "" {
					c.ID = tc.ID
				}
				if tc.Function.Name != "" {
					c.Name = tc.Function.Name
				}
				args[tc.Index].WriteString(tc.Function.Arguments)
			}
		}
		return true
	})
	if err == nil {
		err = streamE
	}
	if err != nil {
		return ChatResponse{}, err
	}
	res := ChatResponse{Content: strings.TrimSpace(text.String()), Model: firstNonEmpty(model2, model), Usage: usage}
	idx := make([]int, 0, len(calls))
	for i := range calls {
		idx = append(idx, i)
	}
	sort.Ints(idx)
	for _, i := range idx {
		c := calls[i]
		c.Arguments = validArgs(args[i].String())
		res.ToolCalls = append(res.ToolCalls, *c)
	}
	if !gotUse {
		fillUsage(&res, req)
	}
	return res, nil
}

func validArgs(s string) json.RawMessage {
	raw := json.RawMessage(strings.TrimSpace(s))
	if len(raw) == 0 || !json.Valid(raw) {
		return json.RawMessage(`{}`)
	}
	return raw
}

// —— Anthropic ——

func streamAnthropic(ctx context.Context, cfg Config, req ChatRequest, onDelta func(string)) (ChatResponse, error) {
	base, model, payload := anthropicPayload(cfg, req)
	payload["stream"] = true
	body, err := postStream(ctx, base+"/v1/messages", map[string]string{"x-api-key": cfg.APIKey, "anthropic-version": "2023-06-01"}, payload)
	if err != nil {
		return ChatResponse{}, err
	}
	defer body.Close()
	type block struct {
		kind string
		call ToolCall
		args strings.Builder
	}
	var (
		text    strings.Builder
		blocks  = map[int]*block{}
		order   []int
		usage   Usage
		model2  string
		streamE error
	)
	err = readSSE(body, func(_, data string) bool {
		var ev struct {
			Type    string `json:"type"`
			Index   int    `json:"index"`
			Message struct {
				Model string `json:"model"`
				Usage struct {
					InputTokens  int64 `json:"input_tokens"`
					OutputTokens int64 `json:"output_tokens"`
				} `json:"usage"`
			} `json:"message"`
			ContentBlock struct {
				Type string `json:"type"`
				ID   string `json:"id"`
				Name string `json:"name"`
			} `json:"content_block"`
			Delta struct {
				Type        string `json:"type"`
				Text        string `json:"text"`
				PartialJSON string `json:"partial_json"`
			} `json:"delta"`
			Usage struct {
				OutputTokens int64 `json:"output_tokens"`
			} `json:"usage"`
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if json.Unmarshal([]byte(data), &ev) != nil {
			return true
		}
		switch ev.Type {
		case "message_start":
			model2 = ev.Message.Model
			usage.InputTokens, usage.OutputTokens = ev.Message.Usage.InputTokens, ev.Message.Usage.OutputTokens
		case "content_block_start":
			b := &block{kind: ev.ContentBlock.Type, call: ToolCall{ID: ev.ContentBlock.ID, Name: ev.ContentBlock.Name}}
			blocks[ev.Index] = b
			order = append(order, ev.Index)
		case "content_block_delta":
			b := blocks[ev.Index]
			if b == nil {
				return true
			}
			switch ev.Delta.Type {
			case "text_delta":
				text.WriteString(ev.Delta.Text)
				onDelta(ev.Delta.Text)
			case "input_json_delta":
				b.args.WriteString(ev.Delta.PartialJSON)
			}
		case "message_delta":
			if ev.Usage.OutputTokens > 0 {
				usage.OutputTokens = ev.Usage.OutputTokens
			}
		case "message_stop":
			return false
		case "error":
			streamE = errors.New("AI 服务返回错误：" + ev.Error.Message)
			return false
		}
		return true
	})
	if err == nil {
		err = streamE
	}
	if err != nil {
		return ChatResponse{}, err
	}
	res := ChatResponse{Content: strings.TrimSpace(text.String()), Model: firstNonEmpty(model2, model), Usage: usage}
	for _, i := range order {
		if b := blocks[i]; b.kind == "tool_use" {
			b.call.Arguments = validArgs(b.args.String())
			res.ToolCalls = append(res.ToolCalls, b.call)
		}
	}
	fillUsage(&res, req)
	return res, nil
}
