package mdclean

import (
	"strings"
	"testing"
)

func TestStripPermalinkAnchors(t *testing.T) {
	cases := map[string]string{
		"# Parquet Content-Defined Chunking[#](/book/reader/x/y#parquet-content-defined-chunking)": "# Parquet Content-Defined Chunking",
		"## Use CLI[\u200b](https://a.io/docs#use-cli \"Direct link to Use CLI\")":                 "## Use CLI",
		"## Title[¶](https://a.io/p#title \"Permanent link\")":                                     "## Title",
		"## Title[](https://a.io/p#title)":                                                         "## Title",
		"## Title [🔗](https://a.io/p#title)":                                                       "## Title",
		"![](https://a.io/img.png#frag) 图片保留":                                                      "![](https://a.io/img.png#frag) 图片保留",
		"见 [文档](https://a.io/p#sec) 说明":                                                            "见 [文档](https://a.io/p#sec) 说明",
		"[#](https://a.io/p) 无锚点不动":                                                                "[#](https://a.io/p) 无锚点不动",
	}
	for in, want := range cases {
		if got := strings.TrimRight(StripPermalinkAnchors(in+"\n"), "\n"); got != want {
			t.Errorf("StripPermalinkAnchors(%q) = %q, want %q", in, got, want)
		}
	}
}
