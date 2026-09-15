package app

import (
	"encoding/json"
	"testing"
)

// TestNormalizeFooterLinks 覆盖页脚链接归一化：空值清空、丢弃不完整链接与空分组、超限报错。
func TestNormalizeFooterLinks(t *testing.T) {
	// 空串与空数组都归一化为空（前端回退默认页脚）
	for _, raw := range []string{"", "  ", "[]"} {
		if out, err := normalizeFooterLinks(raw); err != nil || out != "" {
			t.Fatalf("normalizeFooterLinks(%q) = %q, %v; want empty", raw, out, err)
		}
	}

	// 非法 JSON 报错
	if _, err := normalizeFooterLinks("{not json"); err == nil {
		t.Fatal("expected error for invalid JSON")
	}

	// 丢弃缺 label/href 的链接与空分组，保留有效项并 trim
	raw := `[{"title":" 产品 ","links":[{"label":" 探索 ","href":" /explore "},{"label":"","href":"/x"}]},{"title":"空组","links":[{"label":"a","href":""}]}]`
	out, err := normalizeFooterLinks(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	var groups []footerLinkGroup
	if err := json.Unmarshal([]byte(out), &groups); err != nil {
		t.Fatalf("output not valid JSON: %v", err)
	}
	if len(groups) != 1 {
		t.Fatalf("want 1 group after dropping empties, got %d", len(groups))
	}
	if groups[0].Title != "产品" || len(groups[0].Links) != 1 || groups[0].Links[0].Label != "探索" || groups[0].Links[0].Href != "/explore" {
		t.Fatalf("unexpected normalized group: %+v", groups[0])
	}

	// 分组数超限报错
	big := make([]footerLinkGroup, 9)
	for i := range big {
		big[i] = footerLinkGroup{Title: "g", Links: []footerLink{{Label: "a", Href: "/a"}}}
	}
	b, _ := json.Marshal(big)
	if _, err := normalizeFooterLinks(string(b)); err == nil {
		t.Fatal("expected error for too many groups")
	}
}
