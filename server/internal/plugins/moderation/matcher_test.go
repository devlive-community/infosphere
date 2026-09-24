package moderation

import "testing"

func runesOf(words ...string) [][]rune {
	out := make([][]rune, len(words))
	for i, w := range words {
		out[i] = normalize([]rune(w), false).runes
	}
	return out
}

// 经典 Aho-Corasick 用例：he / she / his / hers 在 ushers 中的全部命中（含重叠）。
func TestAutomatonFindsOverlappingWords(t *testing.T) {
	ac := buildAutomaton(runesOf("he", "she", "his", "hers"))
	found := map[string]bool{}
	for _, m := range ac.search([]rune("ushers"), 100) {
		found[string([]rune("ushers")[m.start:m.end+1])] = true
	}
	if !found["she"] || !found["he"] || !found["hers"] || found["his"] || len(found) != 3 {
		t.Fatalf("命中错误: %v", found)
	}
}

func TestNormalizeAndLocate(t *testing.T) {
	orig := []rune("第一行\n这是 敏 感*词，还有ＢＡＤ")
	norm := normalize(orig, true)
	ac := buildAutomaton([][]rune{normalize([]rune("敏感词"), true).runes, normalize([]rune("bad"), true).runes})
	matches := ac.search(norm.runes, 10)
	if len(matches) != 2 {
		t.Fatalf("应命中插入干扰字符的「敏感词」与全角大写的 BAD: %v", matches)
	}
	line, col, start, end := locate(orig, norm, matches[0])
	if line != 2 || col != 4 || string(orig[start:end+1]) != "敏 感*词" {
		t.Fatalf("位置错误: line=%d col=%d text=%q", line, col, string(orig[start:end+1]))
	}
	if ctx := contextOf(orig, start, end); ctx != "第一行 这是 敏 感*词，还有ＢＡＤ" {
		t.Fatalf("上下文应含命中前后文字且换行转为空格: %q", ctx)
	}
	// 不忽略干扰字符时不命中
	if strict := normalize(orig, false); len(buildAutomaton(runesOf("敏感词")).search(strict.runes, 10)) != 0 {
		t.Fatal("关闭忽略干扰字符后不应命中「敏 感*词」")
	}
}

func TestSplitWords(t *testing.T) {
	got := splitWords("a\nb，c、d;A\n\n e ")
	if len(got) != 5 || got[0] != "a" || got[4] != "e" {
		t.Fatalf("分隔/去重错误: %v", got)
	}
}
