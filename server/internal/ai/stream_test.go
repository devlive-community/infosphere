package ai

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func sse(w http.ResponseWriter, events ...string) {
	w.Header().Set("Content-Type", "text/event-stream")
	for _, e := range events {
		_, _ = io.WriteString(w, e+"\n\n")
	}
}

func TestOpenAIStreamTextToolsAndUsage(t *testing.T) {
	var got map[string]any
	rejectOptions := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		got = map[string]any{}
		_ = json.Unmarshal(raw, &got)
		if rejectOptions && got["stream_options"] != nil {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":{"message":"Unrecognized request argument supplied: stream_options"}}`))
			return
		}
		sse(w,
			`data: {"model":"m-1","choices":[{"delta":{"content":"你好"}}]}`,
			`data: {"choices":[{"delta":{"content":"，世界"}}]}`,
			`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"search_book","arguments":"{\"que"}}]}}]}`,
			`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ry\":\"缓存\"}"}}]}}]}`,
			`data: {"choices":[],"usage":{"prompt_tokens":40,"completion_tokens":7}}`,
			`data: [DONE]`)
	}))
	defer srv.Close()
	cfg := Config{Provider: ProviderOpenAI, BaseURL: srv.URL, APIKey: "k", Model: "m"}
	var deltas []string
	res, err := ChatStream(context.Background(), cfg, ChatRequest{Messages: []Message{{Role: "user", Content: "hi"}}}, func(s string) { deltas = append(deltas, s) })
	if err != nil || res.Content != "你好，世界" || strings.Join(deltas, "|") != "你好|，世界" {
		t.Fatalf("文本流异常: %v %+v %v", err, res, deltas)
	}
	if len(res.ToolCalls) != 1 || res.ToolCalls[0].ID != "call_1" || string(res.ToolCalls[0].Arguments) != `{"query":"缓存"}` {
		t.Fatalf("工具调用拼装异常: %+v", res.ToolCalls)
	}
	if res.Usage.InputTokens != 40 || res.Usage.OutputTokens != 7 || res.Usage.Estimated || res.Model != "m-1" {
		t.Fatalf("用量异常: %+v", res)
	}
	if got["stream"] != true || got["stream_options"] == nil {
		t.Fatalf("应请求流式与用量: %v", got)
	}
	// 服务不支持 stream_options：去掉后重试，用量按文本估算
	rejectOptions = true
	res, err = ChatStream(context.Background(), cfg, ChatRequest{Messages: []Message{{Role: "user", Content: "hi"}}}, nil)
	if err != nil || res.Content != "你好，世界" || got["stream_options"] != nil {
		t.Fatalf("应去掉 stream_options 重试: %v %+v", err, got)
	}
}

func TestAnthropicStream(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sse(w,
			`event: message_start`+"\n"+`data: {"type":"message_start","message":{"model":"claude-x","usage":{"input_tokens":55,"output_tokens":1}}}`,
			`event: content_block_start`+"\n"+`data: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}`,
			`event: content_block_delta`+"\n"+`data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"先查"}}`,
			`event: content_block_start`+"\n"+`data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tu_1","name":"read_section"}}`,
			`event: content_block_delta`+"\n"+`data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"id\":"}}`,
			`event: content_block_delta`+"\n"+`data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"3}"}}`,
			`event: message_delta`+"\n"+`data: {"type":"message_delta","usage":{"output_tokens":12}}`,
			`event: message_stop`+"\n"+`data: {"type":"message_stop"}`)
	}))
	defer srv.Close()
	cfg := Config{Provider: ProviderAnthropic, BaseURL: srv.URL, APIKey: "k"}
	var deltas []string
	res, err := ChatStream(context.Background(), cfg, ChatRequest{Messages: []Message{{Role: "user", Content: "hi"}}}, func(s string) { deltas = append(deltas, s) })
	if err != nil || res.Content != "先查" || len(deltas) != 1 {
		t.Fatalf("文本流异常: %v %+v", err, res)
	}
	if len(res.ToolCalls) != 1 || res.ToolCalls[0].Name != "read_section" || string(res.ToolCalls[0].Arguments) != `{"id":3}` {
		t.Fatalf("工具调用拼装异常: %+v", res.ToolCalls)
	}
	if res.Usage.InputTokens != 55 || res.Usage.OutputTokens != 12 || res.Model != "claude-x" {
		t.Fatalf("用量异常: %+v", res)
	}
}

func TestStreamErrorEvent(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sse(w, `event: error`+"\n"+`data: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}`)
	}))
	defer srv.Close()
	if _, err := ChatStream(context.Background(), Config{Provider: ProviderAnthropic, BaseURL: srv.URL, APIKey: "k"}, ChatRequest{}, nil); err == nil || !strings.Contains(err.Error(), "Overloaded") {
		t.Fatalf("流中的错误事件应返回错误: %v", err)
	}
}
