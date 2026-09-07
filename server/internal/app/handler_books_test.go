package app

import (
	"strings"
	"testing"
)

func TestNormalizeWatermark(t *testing.T) {
	text, valid := normalizeWatermark("  作者 · 仅供学习  ")
	if !valid || text != "作者 · 仅供学习" {
		t.Fatalf("水印规范化结果异常: text=%q valid=%v", text, valid)
	}
	if _, valid := normalizeWatermark(strings.Repeat("知", maxWatermarkLength+1)); valid {
		t.Fatal("超过 80 个 Unicode 字符的水印应被拒绝")
	}
}
