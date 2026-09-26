package app

import (
	"strings"
	"testing"
	"time"

	"knowforge/server/internal/config"
)

func TestStreamTicket(t *testing.T) {
	a := &App{Config: &config.Config{Secret: "secret-a"}}
	now := time.Now()
	ticket := a.issueStreamTicket(42, now)
	if uid, err := a.parseStreamTicket(ticket, now.Add(30*time.Second)); err != nil || uid != 42 {
		t.Fatalf("有效期内应通过: %d %v", uid, err)
	}
	if _, err := a.parseStreamTicket(ticket, now.Add(61*time.Second)); err == nil {
		t.Fatal("过期凭证应拒绝")
	}
	other := &App{Config: &config.Config{Secret: "secret-b"}}
	if _, err := other.parseStreamTicket(ticket, now); err == nil {
		t.Fatal("其他密钥签发的凭证应拒绝")
	}
	encoded, sig, _ := strings.Cut(ticket, ".")
	forged := strings.Replace(encoded, encoded[:2], "OT", 1) + "." + sig // 篡改载荷
	if _, err := a.parseStreamTicket(forged, now); err == nil {
		t.Fatal("篡改的凭证应拒绝")
	}
	for _, bad := range []string{"", "abc", "a.b.c", ticket + "x"} {
		if _, err := a.parseStreamTicket(bad, now); err == nil {
			t.Fatalf("非法凭证应拒绝: %q", bad)
		}
	}
}
