package plugincore

import "knowforge/server/internal/models"

// —— 内容访问门禁：插件可限制读者获取章节全文（如付费内容），核心在所有内容出口统一询问。——
//
// 出口包括：章节详情接口（阅读页）、整本导出（PDF/EPUB/DOCX/Markdown）、搜索摘要等。作者、协作者与管理员不经门禁。
// 未登记门禁时一律放行。

// ContentAccess 门禁结论：不允许时 Preview 为可展示的试读内容，Paywall 为给前端展示付费墙的信息（由插件定义）。
type ContentAccess struct {
	Allowed bool
	Preview string
	Paywall map[string]any
}

// ContentGate 内容门禁。
type ContentGate struct {
	// Document 读者能否阅读章节全文。
	Document func(core Core, u *models.User, book *models.Book, doc *models.Document) ContentAccess
	// BookFully 读者能否获取整本全文（导出等整本出口）；nil 视为允许。
	BookFully func(core Core, u *models.User, book *models.Book) bool
}

var contentGates []ContentGate

// RegisterContentGate 登记内容门禁。
func RegisterContentGate(g ContentGate) { contentGates = append(contentGates, g) }

// CheckContentAccess 依次询问门禁，第一个拒绝的结论生效。
func CheckContentAccess(core Core, u *models.User, book *models.Book, doc *models.Document) ContentAccess {
	for _, g := range contentGates {
		if g.Document == nil {
			continue
		}
		if access := g.Document(core, u, book, doc); !access.Allowed {
			return access
		}
	}
	return ContentAccess{Allowed: true}
}

// BookFullyAccessible 读者能否获取整本全文。
func BookFullyAccessible(core Core, u *models.User, book *models.Book) bool {
	for _, g := range contentGates {
		if g.BookFully != nil && !g.BookFully(core, u, book) {
			return false
		}
	}
	return true
}
