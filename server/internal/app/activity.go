package app

import "knowforge/server/internal/plugincore"

// emitActivity 在业务操作成功后发出一个业务活动事件（注册、建书、评论、阅读等），
// 由订阅的插件处理（如成就插件据此幂等地触发评估）；无订阅者时为空操作，失败不反向影响主业务。
func (a *App) emitActivity(userID uint, eventType, sourceType, sourceID, dedupeKey string) {
	plugincore.FireActivity(a, plugincore.ActivityEvent{UserID: userID, Type: eventType, SourceType: sourceType, SourceID: sourceID, DedupeKey: dedupeKey})
}
