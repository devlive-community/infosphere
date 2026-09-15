package app

import "testing"

// TestExtractDocIcon 覆盖章节图标元数据提取：大小写不敏感、取首个、非法字符过滤、无匹配返回空。
func TestExtractDocIcon(t *testing.T) {
	cases := []struct {
		name    string
		content string
		want    string
	}{
		{"none", "# Title\n正文无元数据", ""},
		{"simple", "<!-- icon: database -->\n# Title", "database"},
		{"case-insensitive", "<!-- ICON:  Book  -->", "book"},
		{"with-style", "<!-- icon: brands fa-github -->", "brands fa-github"},
		{"strip-illegal", "<!-- icon: rocket! @home -->", "rocket home"},
		{"first-wins", "<!-- icon: home -->\n<!-- icon: gear -->", "home"},
	}
	for _, tc := range cases {
		if got := extractDocIcon(tc.content); got != tc.want {
			t.Errorf("%s: extractDocIcon() = %q, want %q", tc.name, got, tc.want)
		}
	}
}
