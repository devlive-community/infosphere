package membership

import "knowforge/server/internal/plugincore"

// 仅供外部测试包（membership_test）使用的内部入口。

// Sweep 执行一次到期提醒巡检。
func Sweep(core plugincore.Core) { sweep(core, nil) }
