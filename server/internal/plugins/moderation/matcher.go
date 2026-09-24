package moderation

import (
	"strings"
	"unicode"
)

// 敏感词匹配：Aho-Corasick 自动机，一次扫描找出全部词条；文本先规范化（大小写、全角→半角，可选忽略空白与符号，
// 用来识别「敏 感」「敏*感」这类插入干扰字符的写法），命中位置映射回原文以给出行号、列号与上下文。

// normalized 规范化后的文本与到原文的位置映射。
type normalized struct {
	runes []rune
	pos   []int // runes[i] 对应原文 rune 下标
}

func foldRune(r rune) rune {
	if r >= 0xFF01 && r <= 0xFF5E { // 全角 ASCII → 半角
		r -= 0xFEE0
	} else if r == 0x3000 {
		r = ' '
	}
	return unicode.ToLower(r)
}

func isNoise(r rune) bool { return unicode.IsSpace(r) || unicode.IsPunct(r) || unicode.IsSymbol(r) }

func normalize(orig []rune, skipNoise bool) normalized {
	n := normalized{runes: make([]rune, 0, len(orig)), pos: make([]int, 0, len(orig))}
	for i, r := range orig {
		r = foldRune(r)
		if skipNoise && isNoise(r) {
			continue
		}
		n.runes = append(n.runes, r)
		n.pos = append(n.pos, i)
	}
	return n
}

type acNode struct {
	next map[rune]int
	fail int
	out  []int // 以此节点结尾的词条下标
}

// automaton 词典自动机；words 为规范化后的词条（与 entries 一一对应）。
type automaton struct {
	nodes []acNode
	words [][]rune
}

func buildAutomaton(words [][]rune) *automaton {
	a := &automaton{nodes: []acNode{{next: map[rune]int{}}}, words: words}
	for i, w := range words {
		if len(w) == 0 {
			continue
		}
		cur := 0
		for _, r := range w {
			nxt, ok := a.nodes[cur].next[r]
			if !ok {
				a.nodes = append(a.nodes, acNode{next: map[rune]int{}})
				nxt = len(a.nodes) - 1
				a.nodes[cur].next[r] = nxt
			}
			cur = nxt
		}
		a.nodes[cur].out = append(a.nodes[cur].out, i)
	}
	// BFS 构造失败指针
	queue := []int{}
	for _, child := range a.nodes[0].next {
		queue = append(queue, child)
	}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		for r, child := range a.nodes[cur].next {
			f := a.nodes[cur].fail
			for f != 0 {
				if _, ok := a.nodes[f].next[r]; ok {
					break
				}
				f = a.nodes[f].fail
			}
			if target, ok := a.nodes[f].next[r]; ok && target != child {
				a.nodes[child].fail = target
			}
			a.nodes[child].out = append(a.nodes[child].out, a.nodes[a.nodes[child].fail].out...)
			queue = append(queue, child)
		}
	}
	return a
}

// match 一处命中：规范化文本中的 [start, end] 与词条下标。
type match struct {
	start, end int
	word       int
}

func (a *automaton) search(text []rune, limit int) []match {
	var out []match
	cur := 0
	for i, r := range text {
		for cur != 0 {
			if _, ok := a.nodes[cur].next[r]; ok {
				break
			}
			cur = a.nodes[cur].fail
		}
		if nxt, ok := a.nodes[cur].next[r]; ok {
			cur = nxt
		}
		for _, w := range a.nodes[cur].out {
			out = append(out, match{start: i - len(a.words[w]) + 1, end: i, word: w})
			if len(out) >= limit {
				return out
			}
		}
	}
	return out
}

// Hit 一处命中（展示给管理员与作者）：字段、行列号、原文片段与上下文。
type Hit struct {
	Field    string `json:"field"`
	Word     string `json:"word"`
	Category string `json:"category,omitempty"`
	Line     int    `json:"line"`
	Column   int    `json:"column"`
	Text     string `json:"text"`    // 原文中命中的片段
	Context  string `json:"context"` // 前后各约 20 字
}

const contextRadius = 20

// locate 把规范化文本中的命中映射回原文位置。
func locate(orig []rune, norm normalized, m match) (line, column, start, end int) {
	start, end = norm.pos[m.start], norm.pos[m.end]
	line, lineStart := 1, 0
	for i := 0; i < start; i++ {
		if orig[i] == '\n' {
			line++
			lineStart = i + 1
		}
	}
	return line, start - lineStart + 1, start, end
}

func contextOf(orig []rune, start, end int) string {
	from, to := start-contextRadius, end+contextRadius+1
	if from < 0 {
		from = 0
	}
	if to > len(orig) {
		to = len(orig)
	}
	s := strings.NewReplacer("\n", " ", "\r", " ", "\t", " ").Replace(string(orig[from:to]))
	if from > 0 {
		s = "…" + s
	}
	if to < len(orig) {
		s += "…"
	}
	return s
}
