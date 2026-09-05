// Package authz 定义 InfoSphere 的权限模型。
//
// 权限标识统一使用 `功能:权限`（resource:action）格式，例如 user:read、book:create、
// system:upgrade。所有认证后的 API 端点必须在路由注册时通过 RequirePermission 声明
// 所需权限；公开只读端点匿名可访问，但同样在 docs/api.md 中登记其语义权限。
package authz

// Permission 权限标识
type Permission string

// 资源:操作 常量。新增资源时先在此定义，再在路由与 docs/api.md 中登记。
const (
	// 书籍
	BookRead   Permission = "book:read"   // 浏览书籍列表与详情（含公开匿名访问）
	BookCreate Permission = "book:create" // 创建书籍
	BookUpdate Permission = "book:update" // 更新书籍（仅限本人或管理员）
	BookDelete Permission = "book:delete" // 删除书籍（仅限本人或管理员）

	// 文档（章节）
	DocumentRead   Permission = "document:read"   // 浏览文档树与正文（含公开匿名访问）
	DocumentCreate Permission = "document:create" // 创建文档（仅限本人书籍）
	DocumentUpdate Permission = "document:update" // 更新文档（仅限本人书籍）
	DocumentDelete Permission = "document:delete" // 删除文档（仅限本人书籍）

	// 标签
	TagRead   Permission = "tag:read"   // 浏览标签与按标签检索（含匿名访问）
	TagCreate Permission = "tag:create" // 创建标签（登录用户，书籍打标时自动创建）
	TagDelete Permission = "tag:delete" // 删除标签（仅管理员）

	// 用户
	UserRead   Permission = "user:read"   // 查看用户公开主页
	UserUpdate Permission = "user:update" // 更新个人资料与密码

	// 站点
	SiteRead  Permission = "site:read"   // 读取站点公开配置
	SiteUpdate Permission = "site:update" // 更新站点配置（仅管理员）

	// 统计
	StatsRead Permission = "stats:read" // 读取站点统计（含匿名访问）

	// 上传
	UploadCreate Permission = "upload:create" // 上传图片

	// 系统管理
	SystemRead    Permission = "system:read"    // 查看系统版本信息（仅管理员）
	SystemUpgrade Permission = "system:upgrade" // 触发在线升级（仅管理员）
)

// All 全部权限，admin 角色默认拥有
var All = []Permission{
	BookRead, BookCreate, BookUpdate, BookDelete,
	DocumentRead, DocumentCreate, DocumentUpdate, DocumentDelete,
	TagRead, TagCreate, TagDelete,
	UserRead, UserUpdate,
	SiteRead, SiteUpdate,
	StatsRead,
	UploadCreate,
	SystemRead, SystemUpgrade,
}

// userPermissions 普通用户（user 角色）拥有的权限
var userPermissions = []Permission{
	BookRead, BookCreate, BookUpdate, BookDelete,
	DocumentRead, DocumentCreate, DocumentUpdate, DocumentDelete,
	TagRead, TagCreate,
	UserRead, UserUpdate,
	SiteRead, StatsRead,
	UploadCreate,
}

// rolePermissions 角色 → 权限映射
var rolePermissions = map[string][]Permission{
	"admin": All,
	"user":  userPermissions,
}

// ForRole 返回角色的全部权限
func ForRole(role string) []Permission {
	perms, ok := rolePermissions[role]
	if !ok {
		return nil
	}
	out := make([]Permission, len(perms))
	copy(out, perms)
	return out
}

// Has 判断角色是否拥有指定权限
func Has(role string, perm Permission) bool {
	for _, p := range rolePermissions[role] {
		if p == perm {
			return true
		}
	}
	return false
}
