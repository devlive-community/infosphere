package app

import "sync"

// pluginManager 跟踪每个插件的“操作代次”，用于避免竞态：
// 安装在后台 goroutine 中进行，若期间管理员卸载/重装，旧 goroutine 的 DB 写入必须被丢弃，
// 否则 GORM Save（主键已存在时会 upsert）会把已删除的插件行重新写回，导致“卸载后仍显示已安装”。
type pluginManager struct {
	mu  sync.Mutex
	gen map[string]int64
}

func newPluginManager() *pluginManager {
	return &pluginManager{gen: map[string]int64{}}
}

// begin 开启针对某插件的新操作，递增并返回该操作的代次令牌。
// 任何进行中的旧操作都会因代次变化而失效。
func (m *pluginManager) begin(key string) int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.gen[key]++
	return m.gen[key]
}

// current 判断给定代次是否仍是该插件的当前操作。
func (m *pluginManager) current(key string, gen int64) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.gen[key] == gen
}
