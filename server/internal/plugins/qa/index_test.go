package qa

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func TestSplitSectionsAnchorsMatchReader(t *testing.T) {
	content := "开头\n\n## 第一节 [链接](http://x)\n正文一\n```\n## 代码里的不是标题\n```\n### 子节 `code`\n正文二\n#### 四级不计\n## 第二节\n正文三"
	secs := splitSections(content)
	if len(secs) != 4 {
		t.Fatalf("小节数 = %d: %+v", len(secs), secs)
	}
	want := []struct{ heading, anchor string }{{"", ""}, {"第一节 链接", "h-1"}, {"子节 code", "h-2"}, {"第二节", "h-3"}}
	for i, w := range want {
		if secs[i].heading != w.heading || secs[i].anchor != w.anchor {
			t.Fatalf("第 %d 节 = %q/%q，期望 %q/%q", i, secs[i].heading, secs[i].anchor, w.heading, w.anchor)
		}
	}
	if !strings.Contains(strings.Join(secs[1].body, "\n"), "## 代码里的不是标题") {
		t.Fatal("代码块内的井号行应保留在正文中")
	}
}

func TestSplitBodyLimitsAndOverlap(t *testing.T) {
	long := strings.Repeat("字", maxChunkRunes*2+50)
	parts := splitBody("短段落。\n\n" + long)
	if len(parts) < 3 {
		t.Fatalf("应切成多块: %d", len(parts))
	}
	for _, p := range parts {
		if utf8.RuneCountInString(p) > maxChunkRunes {
			t.Fatalf("块超长: %d", utf8.RuneCountInString(p))
		}
	}
	if splitBody("  ") != nil {
		t.Fatal("空正文不应产生分块")
	}
}

func TestTermsMixedScripts(t *testing.T) {
	got := strings.Join(terms("Hudi 表类型, v2"), " ")
	if got != "hudi 表 类 表类 型 类型 v2" {
		t.Fatalf("分词 = %q", got)
	}
}

func TestBM25PrefersMatchingChunk(t *testing.T) {
	chunks := []Chunk{{Terms: strings.Join(terms("缓存 加速 读取"), " ")}, {Terms: strings.Join(terms("索引 帮助 检索"), " ")}}
	s := bm25(chunks, terms("索引"))
	if !(s[1] > 0 && s[0] == 0) {
		t.Fatalf("得分 = %v", s)
	}
}

func TestVectorRoundTripAndCosine(t *testing.T) {
	v := []float32{1, 2, 3}
	if got := decodeVector(encodeVector(v)); len(got) != 3 || got[2] != 3 {
		t.Fatalf("解码 = %v", got)
	}
	if c := cosine(v, v); c < 0.999 {
		t.Fatalf("相同向量余弦 = %v", c)
	}
	if cosine(v, []float32{1}) != 0 {
		t.Fatal("维度不同应为 0")
	}
}

func TestPlainSnippet(t *testing.T) {
	md := "## 标题\n- 见 [文档](http://x/y) 与 ![图](a.png)\n> **重点** `code`\n```go\nx := 1\n```"
	if got := plainSnippet(md, 100); got != "标题 见 文档 与 重点 code x := 1" {
		t.Fatalf("摘要 = %q", got)
	}
	if got := plainSnippet(strings.Repeat("长", 50), 10); utf8.RuneCountInString(got) != 10 {
		t.Fatalf("截断 = %q", got)
	}
}

func TestCitationsFromAnswer(t *testing.T) {
	src := newSources()
	for i := uint(1); i <= 4; i++ {
		src.add(Chunk{ID: i, DocTitle: "章", Content: "内容"})
	}
	if n := src.add(Chunk{ID: 2}); n != 2 {
		t.Fatalf("重复添加应复用编号: %d", n)
	}
	got := src.citations("见 [3]，另见 [1][3] 与 [9]")
	if len(got) != 2 || got[0].N != 3 || got[1].N != 1 {
		t.Fatalf("出处 = %+v", got)
	}
	if fallback := src.citations("没有标注"); len(fallback) != 3 {
		t.Fatalf("未标注时应给出前三个: %d", len(fallback))
	}
}
