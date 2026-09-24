package i18ntext

import "testing"

func TestRenderAndParse(t *testing.T) {
	Register("test.notify.reviewed", map[string]string{
		"zh-CN": "「{user}」评价了你的书籍《{book}》",
		"en":    `{user} reviewed your book "{book}"`,
	})
	tpl, ok := Template("test.notify.reviewed", "en-US")
	if !ok || Interpolate(tpl, map[string]string{"user": "amy", "book": "Go"}) != `amy reviewed your book "Go"` {
		t.Fatalf("en-US 应回退到 en 模板: %q", tpl)
	}
	if _, ok := Template("test.notify.reviewed", "ja"); ok {
		t.Fatal("未登记的语言不应命中")
	}
	key, params, ok := Parse("zh-CN", "「amy」评价了你的书籍《Go 语言（第 2 版）》", "test.notify.reviewed")
	if !ok || key != "test.notify.reviewed" || params["user"] != "amy" || params["book"] != "Go 语言（第 2 版）" {
		t.Fatalf("反解析失败: %v %v %v", key, params, ok)
	}
	if _, _, ok := Parse("zh-CN", "别的通知", "test.notify.reviewed"); ok {
		t.Fatal("不匹配的文本不应命中")
	}
	if got := Interpolate("{a}-{b}", map[string]string{"a": "1"}); got != "1-{b}" {
		t.Fatalf("缺失参数应保留占位符: %q", got)
	}
}
