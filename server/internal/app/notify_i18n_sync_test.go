package app

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"knowforge/server/internal/i18ntext"
)

var localeEntryRe = regexp.MustCompile(`^\s*'([^']+)':\s*'((?:[^'\\]|\\.)*)',\s*$`)

func loadWebLocale(t *testing.T, name string) map[string]string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "app", "web", "lib", "i18n", "locales", name))
	if err != nil {
		t.Skipf("前端字典不可用（非完整仓库）: %v", err)
	}
	out := map[string]string{}
	for _, line := range strings.Split(string(raw), "\n") {
		if m := localeEntryRe.FindStringSubmatch(line); m != nil {
			out[m[1]] = strings.NewReplacer(`\'`, `'`, `\\`, `\`).Replace(m[2])
		}
	}
	return out
}

// 服务端登记的通知模板（i18ntext）必须与前端字典同键同文，否则站内显示与邮件/兜底标题会不一致。
// notify.email.* 只用于邮件，前端无对应键。
func TestNotificationTemplatesMatchWebDictionaries(t *testing.T) {
	dicts := map[string]map[string]string{"zh-CN": loadWebLocale(t, "zh.ts"), "en": loadWebLocale(t, "en.ts")}
	checked := 0
	for _, key := range i18ntext.Keys() {
		if !strings.HasPrefix(key, "notify.") || strings.HasPrefix(key, "notify.email.") {
			continue
		}
		for locale, dict := range dicts {
			tpl, _ := i18ntext.Template(key, locale)
			if got, ok := dict[key]; !ok || got != tpl {
				t.Errorf("%s [%s]: 服务端 %q，前端 %q（存在=%v）", key, locale, tpl, got, ok)
			}
		}
		checked++
	}
	if checked < 15 {
		t.Fatalf("应校验全部通知模板，实际 %d 个", checked)
	}
}
