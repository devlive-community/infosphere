package app

import (
	"testing"
)

func TestSlugify(t *testing.T) {
	cases := []struct{ in, want string }{
		{"Hello World", "hello-world"},
		{"Next.js SEO Guide", "next-js-seo-guide"},
		{"Go 入门指南", "go"},
		{"入门指南", ""},
		{"  trailing--dashes--  ", "trailing-dashes"},
		{"", ""},
	}
	for _, c := range cases {
		if got := slugify(c.in); got != c.want {
			t.Errorf("slugify(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestValidSlug(t *testing.T) {
	for _, s := range []string{"hello", "hello-world", "book-123"} {
		if !validSlug(s) {
			t.Errorf("validSlug(%q) 应为 true", s)
		}
	}
	for _, s := range []string{"Hello", "-lead", "trail-", "含中文", "a b"} {
		if validSlug(s) {
			t.Errorf("validSlug(%q) 应为 false", s)
		}
	}
}

func TestVersionCompare(t *testing.T) {
	cases := []struct {
		a, b string
		less bool
	}{
		{"2026.0.0", "2026.0.1", true},
		{"2026.0.0", "2026.1.0", true},
		{"2026.0.0", "2027.0.0", true},
		{"2026.0.0", "2026.0.0", false},
		{"2026.0.2", "2026.0.1", false},
		{"v2026.0.0", "2026.0.1", true},
		{"unknown", "2026.0.1", false},
	}
	for _, c := range cases {
		if got := versionLess(c.a, c.b); got != c.less {
			t.Errorf("versionLess(%q, %q) = %v, want %v", c.a, c.b, got, c.less)
		}
	}
}
