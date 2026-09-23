package achievements

import (
	"strings"
	"testing"
)

func TestAchievementRuleValidationUsesMetricWhitelist(t *testing.T) {
	rule := achievementRuleRequest{MetricKey: "reading.chapters_read", Operator: "gte", TargetValue: 10, WindowType: "rolling_days", WindowValue: 30}
	if err := normalizeAchievementRule(&rule); err != nil {
		t.Fatalf("valid rule rejected: %v", err)
	}
	invalid := achievementRuleRequest{MetricKey: "database.raw_sql", Operator: "gte", TargetValue: 1, WindowType: "lifetime"}
	if err := normalizeAchievementRule(&invalid); err == nil {
		t.Fatal("unknown metric must be rejected")
	}
	badFilter := achievementRuleRequest{MetricKey: "reading.chapters_read", Operator: "gte", TargetValue: 1, WindowType: "lifetime", Filters: map[string]any{"sql": "DROP TABLE users"}}
	if err := normalizeAchievementRule(&badFilter); err == nil {
		t.Fatal("metric-specific filter whitelist must reject unknown keys")
	}
}

func TestSanitizeAchievementSVG(t *testing.T) {
	safe := []byte(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><path fill="url(#g)" d="M1 1h22v22z"/></svg>`)
	clean, err := sanitizeAchievementSVG(safe)
	if err != nil {
		t.Fatalf("safe SVG rejected: %v", err)
	}
	if !strings.Contains(string(clean), "<svg") || strings.Contains(string(clean), "<?xml") {
		t.Fatalf("unexpected sanitized SVG: %s", clean)
	}
	for _, malicious := range [][]byte{
		[]byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`),
		[]byte(`<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><path d="M0 0"/></svg>`),
		[]byte(`<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>bad</div></foreignObject></svg>`),
		[]byte(`<svg xmlns="http://www.w3.org/2000/svg"><path fill="url(https://evil.test/x)" d="M0 0"/></svg>`),
	} {
		if _, err := sanitizeAchievementSVG(malicious); err == nil {
			t.Fatalf("malicious SVG must be rejected: %s", malicious)
		}
	}
}
