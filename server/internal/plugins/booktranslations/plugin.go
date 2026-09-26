// Package booktranslations 书籍多语言插件：同一作品的多语言互译组（阅读/详情页切换语言），
// 以及整本 AI 翻译——在同一翻译分组中新建译本，后台先翻译目录再逐章翻译正文（术语表统一用词，译稿为草稿，作者审阅后发布），
// 原书修改或新增章节后可只同步变化的部分。模型经核心「AI 服务」调用，按原文字符计入每月翻译字数权益；
// 能否使用整本 AI 翻译本身也是权益（translate.ai_book），可作为会员专享。
package booktranslations

import (
	"strconv"

	"knowforge/server/internal/authz"
	"knowforge/server/internal/i18ntext"
	"knowforge/server/internal/jobqueue"
	"knowforge/server/internal/plugincore"
	"knowforge/server/internal/plugins"
)

// PermAITranslate 整本 AI 翻译（启用时动态注册，禁用即移除）。
const PermAITranslate authz.Permission = "booktrans:ai"

const (
	entAIBook      = "translate.ai_book"
	cfgAIBookBase  = "book_ai_translate_enabled"
	defaultAIAllow = 1
)

func init() {
	plugins.Register(plugins.Meta{
		Order:       30,
		Key:         plugins.KeyBookTranslations,
		Name:        "书籍多语言",
		Description: "同一作品的多语言互译组：阅读/详情页可在不同语言版本间切换；并可用 AI 整本翻译出新的语言版本（逐章后台翻译、术语表、原书更新后同步），译稿为草稿，审阅后发布。禁用后语言切换入口与相关接口停用（默认启用，数据保留在书籍字段中）。",
		Kind:        plugins.KindFeature,
		Builtin:     true,
		Models:      []any{&TranslateJob{}, &TranslateItem{}, &TranslatedDoc{}, &GlossaryTerm{}},
		Tables:      []string{"book_ai_glossary_terms", "book_ai_translated_docs", "book_ai_translate_items", "book_ai_translate_jobs"},
		UserPerms:   []authz.Permission{PermAITranslate},
	})
	plugincore.RegisterUserDataModels(&TranslateJob{})
	plugincore.OnJobQueueSweep(func(core plugincore.Core, _ *jobqueue.Queue) {
		if core.PluginEnabled(plugins.KeyBookTranslations) {
			sweepInterruptedJobs(core)
		}
	})
	plugincore.RegisterEntitlement(plugincore.EntitlementDef{
		Key: entAIBook, Kind: plugincore.EntitlementFlag, Order: 46,
		Available: func(core plugincore.Core) bool { return core.PluginEnabled(plugins.KeyBookTranslations) },
		Base: func(core plugincore.Core) int64 {
			if v, err := strconv.ParseInt(core.GetSetting(cfgAIBookBase), 10, 64); err == nil && (v == 0 || v == 1) {
				return v
			}
			return defaultAIAllow
		},
		SetBase: func(core plugincore.Core, v int64) error {
			return core.SetSetting(cfgAIBookBase, strconv.FormatInt(v, 10), "权益：整本 AI 翻译（基础）")
		},
	})
	i18ntext.Register("notify.bookTranslate.done", map[string]string{
		"zh-CN": "《{book}》AI 翻译完成：{done} 章已翻译，{failed} 章失败；译稿为草稿，审阅后发布",
		"en":    `AI translation of "{book}" finished: {done} chapters translated, {failed} failed. The drafts are ready for review`,
	})
}
