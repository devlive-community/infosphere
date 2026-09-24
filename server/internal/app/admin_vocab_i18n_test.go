package app

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"knowforge/server/internal/config"
	"knowforge/server/internal/plugincore"
)

var (
	auditCallRe   = regexp.MustCompile(`(?:recordAudit|RecordAudit)\(\s*c,\s*("[a-z0-9_.]+"|\w+),\s*("[a-z0-9_]+"|\w+),`)
	auditActionRe = regexp.MustCompile(`action\s*:?=\s*"([a-z0-9_]+\.[a-z0-9_]+)"`) // 以变量传入的操作（如 document.copied / moved）
)

// 审计日志里后端会写入的每个操作 / 资源类型、后台任务的每种类型，都必须在前端中英文字典中有文案
// （admin.audit.actions.* / admin.audit.resources.* / admin.tasks.types.*），否则管理端会显示原始键。
// 登记的每项权益与权益来源同理（entitlement.*）。
func TestAdminVocabularyIsTranslated(t *testing.T) {
	dicts := map[string]map[string]string{"zh": loadWebLocale(t, "zh.ts"), "en": loadWebLocale(t, "en.ts")}
	want := map[string]bool{}
	root := filepath.Join("..")
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return err
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		src := string(raw)
		for _, m := range auditCallRe.FindAllStringSubmatch(src, -1) {
			if strings.HasPrefix(m[1], `"`) {
				want["admin.audit.actions."+strings.Trim(m[1], `"`)] = true
			} else if m[1] == "action" {
				for _, am := range auditActionRe.FindAllStringSubmatch(src, -1) {
					want["admin.audit.actions."+am[1]] = true
				}
			}
			if strings.HasPrefix(m[2], `"`) {
				want["admin.audit.resources."+strings.Trim(m[2], `"`)] = true
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(want) < 40 {
		t.Fatalf("应从源码中解析出全部审计词汇，实际仅 %d 个", len(want))
	}

	t.Setenv("KNOWFORGE_DATA", t.TempDir())
	a, _, _ := newContentImportTestApp(t)
	a.Config = &config.Config{Installed: true, Secret: "vocab-test"}
	if err := a.configureJobQueue(); err != nil {
		t.Fatal(err)
	}
	types := a.Jobs.Types()
	if len(types) < 8 {
		t.Fatalf("应注册全部后台任务类型（含插件），实际 %v", types)
	}
	for _, ty := range types {
		want["admin.tasks.types."+ty] = true
	}

	// 权益（核心与插件登记）：名称、说明、单位，以及各来源（含内置的 base / admin / unavailable）
	for _, def := range plugincore.Entitlements() {
		want["entitlement."+def.Key+".label"] = true
		want["entitlement."+def.Key+".hint"] = true
		if def.Kind == plugincore.EntitlementLimit {
			want["entitlement.unit."+def.Unit] = true
			want["entitlement.unitShort."+def.Unit] = true
		}
	}
	for _, src := range append(plugincore.EntitlementSourceKeys(), "base", "admin", "unavailable") {
		want["entitlement.source."+src] = true
	}

	for key := range want {
		for lang, dict := range dicts {
			if strings.TrimSpace(dict[key]) == "" {
				t.Errorf("[%s] 缺少管理端文案 %s", lang, key)
			}
		}
	}
}
