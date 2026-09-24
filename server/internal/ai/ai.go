// Package ai 大模型调用的通用客户端：对话（支持工具调用，用于 Agent）与向量嵌入。
//   - 对话：OpenAI 兼容接口（/chat/completions，可接 OpenAI、DeepSeek、通义千问、Kimi、Ollama 等）或 Anthropic Messages API；
//   - 嵌入：OpenAI 兼容接口（/embeddings）。
//
// 由核心按站点「AI 服务」设置构造配置，插件（如问答）经 plugincore.Core 调用，不直接读配置。
package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// 对话服务提供方。
const (
	ProviderOpenAI    = "openai"
	ProviderAnthropic = "anthropic"
)

// Config AI 服务配置。
type Config struct {
	Provider string
	BaseURL  string
	APIKey   string
	Model    string
	// 嵌入服务（OpenAI 兼容）；BaseURL/APIKey 留空时沿用对话服务（仅当对话服务也是 OpenAI 兼容时）
	EmbedBaseURL string
	EmbedAPIKey  string
	EmbedModel   string
}

// ChatAvailable 是否已配置对话服务。
func (c Config) ChatAvailable() bool { return strings.TrimSpace(c.APIKey) != "" || c.isLocal() }

// isLocal 本地服务（如 Ollama）可不填 API Key。
func (c Config) isLocal() bool {
	b := strings.ToLower(c.BaseURL)
	return strings.Contains(b, "localhost") || strings.Contains(b, "127.0.0.1")
}

func (c Config) embedEndpoint() (base, key string, ok bool) {
	if strings.TrimSpace(c.EmbedModel) == "" {
		return "", "", false
	}
	base, key = strings.TrimSpace(c.EmbedBaseURL), strings.TrimSpace(c.EmbedAPIKey)
	if base == "" {
		if c.Provider == ProviderAnthropic {
			return "", "", false // Anthropic 没有嵌入接口，需单独配置
		}
		base = c.BaseURL
	}
	if key == "" && strings.TrimSpace(c.EmbedBaseURL) == "" {
		key = c.APIKey
	}
	if base == "" {
		base = "https://api.openai.com/v1"
	}
	return base, key, key != "" || strings.Contains(strings.ToLower(base), "localhost") || strings.Contains(base, "127.0.0.1")
}

// EmbedAvailable 是否已配置嵌入服务。
func (c Config) EmbedAvailable() bool {
	_, _, ok := c.embedEndpoint()
	return ok
}

// Message 一条对话消息：role 为 user / assistant / tool。
type Message struct {
	Role       string     `json:"role"`
	Content    string     `json:"content"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`   // assistant 发起的工具调用
	ToolCallID string     `json:"tool_call_id,omitempty"` // tool 消息对应的调用
}

// Tool 可供模型调用的工具（Parameters 为 JSON Schema）。
type Tool struct {
	Name        string
	Description string
	Parameters  map[string]any
}

// ToolCall 模型发起的一次工具调用。
type ToolCall struct {
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

// ChatRequest 对话请求。
type ChatRequest struct {
	System      string
	Messages    []Message
	Tools       []Tool
	MaxTokens   int
	Temperature float64
}

// ChatResponse 对话结果：Content 为文本回复，ToolCalls 非空时模型要求调用工具。
type ChatResponse struct {
	Content   string
	ToolCalls []ToolCall
}

var httpClient = &http.Client{Timeout: 120 * time.Second}

func postJSON(ctx context.Context, url string, headers map[string]string, payload any) ([]byte, error) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		if v != "" {
			req.Header.Set(k, v)
		}
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("调用 AI 服务失败: %w", err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		msg := strings.TrimSpace(string(data))
		if len(msg) > 300 {
			msg = msg[:300]
		}
		return nil, fmt.Errorf("AI 服务返回 %d: %s", resp.StatusCode, msg)
	}
	return data, nil
}

// Chat 调用对话服务。
func Chat(ctx context.Context, cfg Config, req ChatRequest) (ChatResponse, error) {
	if !cfg.ChatAvailable() {
		return ChatResponse{}, errors.New("尚未配置 AI 服务")
	}
	if req.MaxTokens <= 0 {
		req.MaxTokens = 2048
	}
	if cfg.Provider == ProviderAnthropic {
		return chatAnthropic(ctx, cfg, req)
	}
	return chatOpenAI(ctx, cfg, req)
}

// —— OpenAI 兼容 ——

func chatOpenAI(ctx context.Context, cfg Config, req ChatRequest) (ChatResponse, error) {
	base := strings.TrimRight(cfg.BaseURL, "/")
	if base == "" {
		base = "https://api.openai.com/v1"
	}
	model := cfg.Model
	if model == "" {
		model = "gpt-4o-mini"
	}
	msgs := []map[string]any{}
	if req.System != "" {
		msgs = append(msgs, map[string]any{"role": "system", "content": req.System})
	}
	for _, m := range req.Messages {
		switch {
		case m.Role == "tool":
			msgs = append(msgs, map[string]any{"role": "tool", "tool_call_id": m.ToolCallID, "content": m.Content})
		case m.Role == "assistant" && len(m.ToolCalls) > 0:
			calls := []map[string]any{}
			for _, tc := range m.ToolCalls {
				calls = append(calls, map[string]any{"id": tc.ID, "type": "function", "function": map[string]any{"name": tc.Name, "arguments": string(tc.Arguments)}})
			}
			msgs = append(msgs, map[string]any{"role": "assistant", "content": m.Content, "tool_calls": calls})
		default:
			msgs = append(msgs, map[string]any{"role": m.Role, "content": m.Content})
		}
	}
	payload := map[string]any{"model": model, "messages": msgs, "max_tokens": req.MaxTokens, "temperature": req.Temperature}
	if len(req.Tools) > 0 {
		tools := []map[string]any{}
		for _, t := range req.Tools {
			tools = append(tools, map[string]any{"type": "function", "function": map[string]any{"name": t.Name, "description": t.Description, "parameters": t.Parameters}})
		}
		payload["tools"] = tools
	}
	data, err := postJSON(ctx, base+"/chat/completions", map[string]string{"Authorization": bearer(cfg.APIKey)}, payload)
	if err != nil {
		return ChatResponse{}, err
	}
	var out struct {
		Choices []struct {
			Message struct {
				Content   string `json:"content"`
				ToolCalls []struct {
					ID       string `json:"id"`
					Function struct {
						Name      string `json:"name"`
						Arguments string `json:"arguments"`
					} `json:"function"`
				} `json:"tool_calls"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(data, &out); err != nil || len(out.Choices) == 0 {
		return ChatResponse{}, errors.New("AI 服务响应格式无效")
	}
	msg := out.Choices[0].Message
	res := ChatResponse{Content: strings.TrimSpace(msg.Content)}
	for _, tc := range msg.ToolCalls {
		args := json.RawMessage(tc.Function.Arguments)
		if !json.Valid(args) {
			args = json.RawMessage(`{}`)
		}
		res.ToolCalls = append(res.ToolCalls, ToolCall{ID: tc.ID, Name: tc.Function.Name, Arguments: args})
	}
	return res, nil
}

func bearer(key string) string {
	if key == "" {
		return ""
	}
	return "Bearer " + key
}

// —— Anthropic Messages ——

func chatAnthropic(ctx context.Context, cfg Config, req ChatRequest) (ChatResponse, error) {
	base := strings.TrimRight(cfg.BaseURL, "/")
	if base == "" {
		base = "https://api.anthropic.com"
	}
	model := cfg.Model
	if model == "" {
		model = "claude-sonnet-5"
	}
	msgs := []map[string]any{}
	appendBlocks := func(role string, blocks []map[string]any) {
		if n := len(msgs); n > 0 && msgs[n-1]["role"] == role {
			msgs[n-1]["content"] = append(msgs[n-1]["content"].([]map[string]any), blocks...)
			return
		}
		msgs = append(msgs, map[string]any{"role": role, "content": blocks})
	}
	for _, m := range req.Messages {
		switch m.Role {
		case "tool": // 工具结果以 user 消息的 tool_result 块回传（连续的合并到同一条消息）
			appendBlocks("user", []map[string]any{{"type": "tool_result", "tool_use_id": m.ToolCallID, "content": m.Content}})
		case "assistant":
			blocks := []map[string]any{}
			if m.Content != "" {
				blocks = append(blocks, map[string]any{"type": "text", "text": m.Content})
			}
			for _, tc := range m.ToolCalls {
				input := map[string]any{}
				_ = json.Unmarshal(tc.Arguments, &input)
				blocks = append(blocks, map[string]any{"type": "tool_use", "id": tc.ID, "name": tc.Name, "input": input})
			}
			appendBlocks("assistant", blocks)
		default:
			appendBlocks("user", []map[string]any{{"type": "text", "text": m.Content}})
		}
	}
	payload := map[string]any{"model": model, "max_tokens": req.MaxTokens, "messages": msgs, "temperature": req.Temperature}
	if req.System != "" {
		payload["system"] = req.System
	}
	if len(req.Tools) > 0 {
		tools := []map[string]any{}
		for _, t := range req.Tools {
			tools = append(tools, map[string]any{"name": t.Name, "description": t.Description, "input_schema": t.Parameters})
		}
		payload["tools"] = tools
	}
	data, err := postJSON(ctx, base+"/v1/messages", map[string]string{"x-api-key": cfg.APIKey, "anthropic-version": "2023-06-01"}, payload)
	if err != nil {
		return ChatResponse{}, err
	}
	var out struct {
		Content []struct {
			Type  string          `json:"type"`
			Text  string          `json:"text"`
			ID    string          `json:"id"`
			Name  string          `json:"name"`
			Input json.RawMessage `json:"input"`
		} `json:"content"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return ChatResponse{}, errors.New("AI 服务响应格式无效")
	}
	var res ChatResponse
	var text []string
	for _, b := range out.Content {
		switch b.Type {
		case "text":
			text = append(text, b.Text)
		case "tool_use":
			args := b.Input
			if len(args) == 0 {
				args = json.RawMessage(`{}`)
			}
			res.ToolCalls = append(res.ToolCalls, ToolCall{ID: b.ID, Name: b.Name, Arguments: args})
		}
	}
	res.Content = strings.TrimSpace(strings.Join(text, "\n"))
	return res, nil
}

// —— 嵌入 ——

// Embed 批量计算文本向量（OpenAI 兼容 /embeddings），按输入顺序返回。
func Embed(ctx context.Context, cfg Config, texts []string) ([][]float32, error) {
	base, key, ok := cfg.embedEndpoint()
	if !ok {
		return nil, errors.New("尚未配置向量嵌入服务")
	}
	data, err := postJSON(ctx, strings.TrimRight(base, "/")+"/embeddings", map[string]string{"Authorization": bearer(key)},
		map[string]any{"model": cfg.EmbedModel, "input": texts})
	if err != nil {
		return nil, err
	}
	var out struct {
		Data []struct {
			Index     int       `json:"index"`
			Embedding []float32 `json:"embedding"`
		} `json:"data"`
	}
	if err := json.Unmarshal(data, &out); err != nil || len(out.Data) != len(texts) {
		return nil, errors.New("向量嵌入响应格式无效")
	}
	vecs := make([][]float32, len(texts))
	for _, d := range out.Data {
		if d.Index < 0 || d.Index >= len(vecs) {
			return nil, errors.New("向量嵌入响应格式无效")
		}
		vecs[d.Index] = d.Embedding
	}
	return vecs, nil
}
