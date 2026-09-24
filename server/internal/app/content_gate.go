package app

import (
	"knowforge/server/internal/models"
	"knowforge/server/internal/plugincore"
)

// 内容访问门禁的核心接入（见 plugincore.ContentGate）：作者、协作者与管理员不经门禁。

// contentAccess 读者对章节全文的访问结论。
func (a *App) contentAccess(u *models.User, book *models.Book, doc *models.Document) plugincore.ContentAccess {
	if u != nil && (IsAdmin(u) || a.canEditBookContent(u, book)) {
		return plugincore.ContentAccess{Allowed: true}
	}
	return plugincore.CheckContentAccess(a, u, book, doc)
}

// applyContentGate 无权阅读全文时把正文替换为试读内容，并附上付费墙信息。
func (a *App) applyContentGate(u *models.User, book *models.Book, doc *models.Document) {
	access := a.contentAccess(u, book, doc)
	if access.Allowed {
		return
	}
	doc.Content = access.Preview
	doc.Paywall = access.Paywall
	if doc.Paywall == nil {
		doc.Paywall = map[string]any{}
	}
	doc.Paywall["locked"] = true
}

// bookFullyAccessible 读者能否获取整本全文（导出等）。
func (a *App) bookFullyAccessible(u *models.User, book *models.Book) bool {
	if u != nil && (IsAdmin(u) || a.canEditBookContent(u, book)) {
		return true
	}
	return plugincore.BookFullyAccessible(a, u, book)
}
