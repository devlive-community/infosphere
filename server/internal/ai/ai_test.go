package ai

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestOpenAIToolCallRoundTrip(t *testing.T) {
	var got map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" || r.Header.Get("Authorization") != "Bearer sk" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &got)
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"","tool_calls":[{"id":"call_1","type":"function","function":{"name":"search_book","arguments":"{\"query\":\"安装\"}"}}]}}]}`))
	}))
	defer srv.Close()
	cfg := Config{Provider: ProviderOpenAI, BaseURL: srv.URL + "/v1", APIKey: "sk", Model: "m"}
	res, err := Chat(context.Background(), cfg, ChatRequest{
		System: "sys",
		Messages: []Message{
			{Role: "user", Content: "怎么安装？"},
			{Role: "assistant", ToolCalls: []ToolCall{{ID: "call_0", Name: "get_toc", Arguments: json.RawMessage(`{}`)}}},
			{Role: "tool", ToolCallID: "call_0", Content: "目录"},
		},
		Tools: []Tool{{Name: "search_book", Description: "d", Parameters: map[string]any{"type": "object"}}},
	})
	if err != nil || len(res.ToolCalls) != 1 || res.ToolCalls[0].Name != "search_book" || string(res.ToolCalls[0].Arguments) != `{"query":"安装"}` {
		t.Fatalf("工具调用解析错误: %v %+v", err, res)
	}
	msgs := got["messages"].([]any)
	if len(msgs) != 4 || msgs[0].(map[string]any)["role"] != "system" || msgs[3].(map[string]any)["tool_call_id"] != "call_0" {
		t.Fatalf("请求消息格式错误: %v", msgs)
	}
	if tools := got["tools"].([]any); tools[0].(map[string]any)["type"] != "function" {
		t.Fatalf("工具格式错误: %v", tools)
	}
}

func TestAnthropicMergesToolResults(t *testing.T) {
	var got map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/messages" || r.Header.Get("x-api-key") != "ak" || r.Header.Get("anthropic-version") == "" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &got)
		_, _ = w.Write([]byte(`{"content":[{"type":"text","text":"根据[1]"},{"type":"tool_use","id":"tu_2","name":"read_section","input":{"id":3}}]}`))
	}))
	defer srv.Close()
	cfg := Config{Provider: ProviderAnthropic, BaseURL: srv.URL, APIKey: "ak"}
	res, err := Chat(context.Background(), cfg, ChatRequest{
		System: "sys",
		Messages: []Message{
			{Role: "user", Content: "问题"},
			{Role: "assistant", ToolCalls: []ToolCall{{ID: "a", Name: "x", Arguments: json.RawMessage(`{}`)}, {ID: "b", Name: "y", Arguments: json.RawMessage(`{"q":1}`)}}},
			{Role: "tool", ToolCallID: "a", Content: "ra"},
			{Role: "tool", ToolCallID: "b", Content: "rb"},
		},
		Tools: []Tool{{Name: "read_section", Parameters: map[string]any{"type": "object"}}},
	})
	if err != nil || res.Content != "根据[1]" || len(res.ToolCalls) != 1 || string(res.ToolCalls[0].Arguments) != `{"id":3}` {
		t.Fatalf("响应解析错误: %v %+v", err, res)
	}
	msgs := got["messages"].([]any)
	if len(msgs) != 3 || got["system"] != "sys" {
		t.Fatalf("消息应为 user/assistant/user 三条: %v", msgs)
	}
	results := msgs[2].(map[string]any)["content"].([]any)
	if len(results) != 2 || results[1].(map[string]any)["tool_use_id"] != "b" {
		t.Fatalf("连续工具结果应合并到同一条 user 消息: %v", results)
	}
	if tools := got["tools"].([]any); tools[0].(map[string]any)["input_schema"] == nil {
		t.Fatal("Anthropic 工具应使用 input_schema")
	}
}

func TestEmbedOrderAndAvailability(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":[{"index":1,"embedding":[0,1]},{"index":0,"embedding":[1,0]}]}`))
	}))
	defer srv.Close()
	cfg := Config{Provider: ProviderOpenAI, BaseURL: srv.URL, APIKey: "sk", EmbedModel: "e"}
	vecs, err := Embed(context.Background(), cfg, []string{"a", "b"})
	if err != nil || vecs[0][0] != 1 || vecs[1][1] != 1 {
		t.Fatalf("应按 index 还原顺序: %v %v", vecs, err)
	}
	if (Config{Provider: ProviderAnthropic, APIKey: "k", EmbedModel: "e"}).EmbedAvailable() {
		t.Fatal("Anthropic 对话服务需单独配置嵌入服务")
	}
	if (Config{Provider: ProviderOpenAI, APIKey: "k"}).EmbedAvailable() {
		t.Fatal("未配置嵌入模型时不可用")
	}
}
