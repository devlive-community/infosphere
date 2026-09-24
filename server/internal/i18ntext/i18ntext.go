// Package i18ntext 服务端可翻译文本登记表（无外部依赖）：核心与插件在 init 中登记文本模板（各语言，占位符 {param}），
// 用于服务端需要直接产出文案的场景——站内通知的兜底标题、通知邮件、历史通知回填。
// 键与前端 i18n 字典一致（前端据通知 payload.i18n 按界面语言渲染），模板写法与前端插值相同。
package i18ntext

import (
	"regexp"
	"sort"
	"strings"
	"sync"
)

var (
	mu      sync.RWMutex
	catalog = map[string]map[string]string{} // key → locale → template
)

// Register 登记一条文本的各语言模板（locale 如 zh-CN、en）。重复登记以最后一次为准。
func Register(key string, templates map[string]string) {
	mu.Lock()
	defer mu.Unlock()
	copied := make(map[string]string, len(templates))
	for k, v := range templates {
		copied[k] = v
	}
	catalog[key] = copied
	patterns = map[string][]pattern{}
}

// Keys 返回全部已登记的键（排序后）。
func Keys() []string {
	mu.RLock()
	defer mu.RUnlock()
	keys := make([]string, 0, len(catalog))
	for k := range catalog {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// Template 按语言取模板：先精确匹配，再按语言主标签回退（en-US → en、zh-Hant → zh-CN 不回退）。
func Template(key, locale string) (string, bool) {
	mu.RLock()
	defer mu.RUnlock()
	tpls, ok := catalog[key]
	if !ok {
		return "", false
	}
	if t, ok := tpls[locale]; ok {
		return t, true
	}
	if base, _, found := strings.Cut(locale, "-"); found {
		if t, ok := tpls[base]; ok {
			return t, true
		}
	}
	return "", false
}

var placeholderRe = regexp.MustCompile(`\{([A-Za-z_][A-Za-z0-9_]*)\}`)

// Interpolate 用参数替换模板中的 {name} 占位符（未提供的参数保留原样）。
func Interpolate(tpl string, params map[string]string) string {
	return placeholderRe.ReplaceAllStringFunc(tpl, func(m string) string {
		if v, ok := params[m[1:len(m)-1]]; ok {
			return v
		}
		return m
	})
}

type pattern struct {
	key string
	re  *regexp.Regexp
}

var patterns = map[string][]pattern{} // locale → 编译好的反解析正则（登记变化时清空）

// compilePatterns 把各键的 locale 模板编译为锚定正则：字面量转义，{name} → (?P<name>.+)。
func compilePatterns(locale string) []pattern {
	mu.Lock()
	defer mu.Unlock()
	if cached, ok := patterns[locale]; ok {
		return cached
	}
	keys := make([]string, 0, len(catalog))
	for k := range catalog {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := make([]pattern, 0, len(keys))
	for _, key := range keys {
		tpl, ok := catalog[key][locale]
		if !ok {
			continue
		}
		var b strings.Builder
		b.WriteString("^")
		last := 0
		for _, loc := range placeholderRe.FindAllStringSubmatchIndex(tpl, -1) {
			b.WriteString(regexp.QuoteMeta(tpl[last:loc[0]]))
			b.WriteString("(?P<" + tpl[loc[2]:loc[3]] + ">.+)")
			last = loc[1]
		}
		b.WriteString(regexp.QuoteMeta(tpl[last:]))
		b.WriteString("$")
		if re, err := regexp.Compile(b.String()); err == nil {
			out = append(out, pattern{key: key, re: re})
		}
	}
	patterns[locale] = out
	return out
}

// Parse 用某语言（通常为 zh-CN，历史标题的语言）的模板反解析文本，返回命中的键与参数。
// 只在键的 keys 白名单内匹配（为空表示全部），避免不同类型通知的模板相互误配。
func Parse(locale, text string, keys ...string) (string, map[string]string, bool) {
	allow := map[string]bool{}
	for _, k := range keys {
		allow[k] = true
	}
	for _, p := range compilePatterns(locale) {
		if len(allow) > 0 && !allow[p.key] {
			continue
		}
		m := p.re.FindStringSubmatch(text)
		if m == nil {
			continue
		}
		params := map[string]string{}
		for i, name := range p.re.SubexpNames() {
			if name != "" {
				params[name] = m[i]
			}
		}
		return p.key, params, true
	}
	return "", nil, false
}
