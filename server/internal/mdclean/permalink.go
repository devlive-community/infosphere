// Package mdclean 提供对 Markdown 正文的纯文本清理（无外部依赖），供核心的「书籍清理」与内容采集插件共用。
package mdclean

import "regexp"

// 文档站常见的「永久链接」锚点：标题后跟一个仅含图标/符号的链接，或链接标题为 "Permanent link"。
// 采集这类站点时会混入正文，点击会误跳到外部地址，需清理。
// 各规则都以 (^|[^!]) 开头，避免误删 ![](…) 图片。
var (
	// [任意文字](url "Permanent link" / "Permalink" / "Direct link to …" / "Link to this heading") —— 按链接标题匹配
	permalinkTitleRe = regexp.MustCompile(`(^|[^!])\[[^\]]*\]\([^)\s]*\s+"(?i:permanent link|permalink|direct link to[^"]*|link to this (?:heading|section)[^"]*)"\)`)
	// [🔗/¶/§/↩/⚓/†/‡](url) —— 链接文字仅为永久链接图标符号
	permalinkGlyphRe = regexp.MustCompile(`(^|[^!])\[[\s\x{200B}-\x{200D}\x{2060}\x{FEFF}]*[🔗¶§↩⚓†‡]+[\s\x{200B}-\x{200D}\x{2060}\x{FEFF}]*\]\([^)\s]+(?:\s+"[^"]*")?\)`)
	// [#](url#frag) / [​](url#frag) / [](url#frag) —— 文字仅为 #、零宽字符或为空、且指向页内锚点
	permalinkHashRe = regexp.MustCompile(`(^|[^!])\[[\s\x{200B}-\x{200D}\x{2060}\x{FEFF}]*#?[\s\x{200B}-\x{200D}\x{2060}\x{FEFF}]*\]\([^)\s]*#[^)\s]*(?:\s+"[^"]*")?\)`)
	// 清理后行尾可能残留的空白
	trailingSpaceRe = regexp.MustCompile(`[ \t]+\n`)
)

// StripPermalinkAnchors 从 Markdown 中移除「永久链接」锚点，返回清理后的文本。
func StripPermalinkAnchors(md string) string {
	md = permalinkTitleRe.ReplaceAllString(md, "$1")
	md = permalinkGlyphRe.ReplaceAllString(md, "$1")
	md = permalinkHashRe.ReplaceAllString(md, "$1")
	md = trailingSpaceRe.ReplaceAllString(md, "\n")
	return md
}
