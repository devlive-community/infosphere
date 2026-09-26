package booktranslations

import (
	"strings"
	"testing"
)

func TestSplitSegments(t *testing.T) {
	content := "第一段。\n\n```go\nfunc a() {}\n\nfunc b() {}\n```\n\n第二段。\n\n第三段很长" + strings.Repeat("字", 20) + "。"
	segs := splitSegments(content, 25)
	if len(segs) != 4 {
		t.Fatalf("应切为 4 段: %+v", segs)
	}
	if segs[0].text != "第一段。" || segs[0].code {
		t.Fatalf("第 1 段异常: %+v", segs[0])
	}
	// 代码块内的空行不切开，整块原样保留
	if !segs[1].code || segs[1].text != "```go\nfunc a() {}\n\nfunc b() {}\n```" {
		t.Fatalf("代码块异常: %+v", segs[1])
	}
	// 超过长度时另起一段；单个段落超长也不拆开
	if segs[2].text != "第二段。" || !strings.HasPrefix(segs[3].text, "第三段很长") {
		t.Fatalf("分段异常: %+v", segs[2:])
	}
	if got := splitSegments("甲。\n\n乙。", 100); len(got) != 1 || got[0].text != "甲。\n\n乙。" {
		t.Fatalf("短段落应合并: %+v", got)
	}
}

func TestCleanOutput(t *testing.T) {
	if got := cleanOutput("```markdown\n# Title\n\nText\n```"); got != "# Title\n\nText" {
		t.Fatalf("应去掉包裹的围栏: %q", got)
	}
	keep := "Intro\n\n```go\ncode\n```\n\nEnd"
	if got := cleanOutput(keep); got != keep {
		t.Fatalf("正文中的代码块不应被去掉: %q", got)
	}
}
