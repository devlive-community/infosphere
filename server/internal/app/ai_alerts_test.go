package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"knowforge/server/internal/ai"
	"knowforge/server/internal/config"
	"knowforge/server/internal/models"
)

// 用量预警：超过阈值时记录并通知管理员，同一对象只报一次；不限制调用本身。
func TestAIUsageAlerts(t *testing.T) {
	t.Setenv("KNOWFORGE_DATA", t.TempDir())
	cfg, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	a, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(a.Router())
	defer server.Close()
	resp, err := http.Post(server.URL+"/api/v1/setup/install", "application/json", strings.NewReader(
		`{"database":{"type":"sqlite"},"site":{"name":"预警测试"},"admin":{"username":"admin","email":"admin@test.local","password":"secret123"}}`))
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("安装失败: %v %v", err, resp)
	}
	resp.Body.Close()
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"model":"m","usage":{"prompt_tokens":50,"completion_tokens":12},"choices":[{"message":{"content":"ok"}}]}`))
	}))
	defer fake.Close()
	user := &models.User{Username: "heavy", Email: "heavy@test.local", Role: "user", IsActive: true, EmailVerified: true}
	a.DB.Create(user)
	for k, v := range map[string]string{"ai_price_input": "1", "ai_price_output": "2", cfgAlertDailyCost: "0.0002", cfgAlertUserDailyTokens: "150", cfgAlertTraceTokens: "100"} {
		if err := a.SetSetting(k, v, ""); err != nil {
			t.Fatal(err)
		}
	}
	chatCfg := ai.Config{Provider: ai.ProviderOpenAI, BaseURL: fake.URL, APIKey: "k", Model: "m"}
	call := func(trace string) {
		ctx := ai.WithCaller(context.Background(), ai.Caller{UserID: user.ID, Feature: "qa.agent", TraceID: trace})
		if _, err := a.meteredChat(ctx, chatCfg, ai.ChatRequest{Messages: []ai.Message{{Role: "user", Content: "hi"}}}, 0); err != nil {
			t.Fatalf("预警不应限制调用: %v", err)
		}
	}
	alerts := func(kind string) int64 {
		var n int64
		a.DB.Model(&models.AIAlert{}).Where("kind = ?", kind).Count(&n)
		return n
	}
	call("t1") // 62 tokens，74 微单位
	if alerts(alertTraceTokens)+alerts(alertUserDailyTokens)+alerts(alertSiteDailyCost) != 0 {
		t.Fatal("未超过阈值不应预警")
	}
	call("t1") // 调用链 124 ≥ 100；用户 124；费用 148
	if alerts(alertTraceTokens) != 1 || alerts(alertUserDailyTokens) != 0 {
		t.Fatalf("调用链超过阈值应预警一次")
	}
	call("t1") // 调用链 186（不重复预警）；用户 186 ≥ 150；费用 222 ≥ 200
	call("t2")
	if alerts(alertTraceTokens) != 1 || alerts(alertUserDailyTokens) != 1 || alerts(alertSiteDailyCost) != 1 {
		t.Fatalf("预警应按对象去重: trace=%d user=%d cost=%d", alerts(alertTraceTokens), alerts(alertUserDailyTokens), alerts(alertSiteDailyCost))
	}
	var notes int64
	a.DB.Model(&models.Notification{}).Where("user_id = ? AND type = ?", 1, "system").Count(&notes)
	if notes < 3 {
		t.Fatalf("管理员应收到三类预警通知: %d", notes)
	}
	var costAlert models.AIAlert
	a.DB.Where("kind = ?", alertSiteDailyCost).First(&costAlert)
	if costAlert.Threshold != 200 || costAlert.Value < 200 || costAlert.Currency != "USD" {
		t.Fatalf("费用预警记录异常: %+v", costAlert)
	}
}
