// Package aiwriter AI 写作助手插件：写作台中对选中的文字续写、改写、润色、扩写、精简，
// 或为章节生成大纲、摘要，也可按作者的自定义要求处理。
//
// 结果在后台经 plugincore.Core 的 AIChatStream 流式生成（每次调用都写入 AI 用量记录），经 SSE 推给写作台，
// 不设整体超时，作者可随时取消；生成完成后在写作台对比原文与结果，再决定替换、插入或放弃。
// 每月使用次数为权益（aiwriter.monthly_uses），可由会员方案或成长等级提升；同时受核心的每月 AI 用量额度约束。
package aiwriter

import (
	"strconv"

	"knowforge/server/internal/authz"
	"knowforge/server/internal/jobqueue"
	"knowforge/server/internal/plugincore"
	"knowforge/server/internal/plugins"
)

// 插件权限（启用时动态注册，禁用即移除）。
const PermUse authz.Permission = "aiwriter:use"

const (
	cfgEnabled         = "ai_writer_enabled"
	cfgMonthlyUses     = "ai_writer_monthly_uses"
	entMonthlyUses     = "aiwriter.monthly_uses"
	defaultMonthlyUses = 100
	maxMonthlyUses     = 100000
)

func init() {
	plugins.Register(plugins.Meta{
		Order:       125,
		Key:         plugins.KeyAIWriter,
		Name:        "AI 写作助手",
		Description: "写作台中的 AI 助手：对选中的文字续写、改写、润色、扩写、精简，为章节生成大纲或摘要，也可按自定义要求处理；结果实时流式生成，对比原文后再决定替换或插入。需先在系统设置配置「AI 服务」；每月使用次数为权益，可由会员/等级提升。默认关闭。",
		Kind:        plugins.KindFeature,
		Builtin:     true,
		EnabledKey:  cfgEnabled,
		Models:      []any{&Task{}},
		Tables:      []string{"ai_writer_tasks"},
		UserPerms:   []authz.Permission{PermUse},
	})
	plugincore.RegisterBehavior(&behavior{})
	plugincore.RegisterUserDataModels(&Task{})
	plugincore.OnJobQueueSweep(func(core plugincore.Core, _ *jobqueue.Queue) {
		if core.PluginEnabled(plugins.KeyAIWriter) {
			sweepInterrupted(core)
		}
	})
	plugincore.RegisterEntitlement(plugincore.EntitlementDef{
		Key: entMonthlyUses, Kind: plugincore.EntitlementLimit, Unit: "uses", Min: 0, Max: maxMonthlyUses, AllowUnlimited: true, Order: 85,
		Available: func(core plugincore.Core) bool { return core.PluginEnabled(plugins.KeyAIWriter) },
		Base: func(core plugincore.Core) int64 {
			if v, err := strconv.ParseInt(core.GetSetting(cfgMonthlyUses), 10, 64); err == nil && (v == plugincore.Unlimited || (v >= 0 && v <= maxMonthlyUses)) {
				return v
			}
			return defaultMonthlyUses
		},
		SetBase: func(core plugincore.Core, v int64) error {
			return core.SetSetting(cfgMonthlyUses, strconv.FormatInt(v, 10), "AI 写作助手：每月使用次数（基础）")
		},
	})
}
