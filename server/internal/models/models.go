package models

import (
	"time"

	"gorm.io/gorm"
)

// User 用户
type User struct {
	ID              uint                 `gorm:"primaryKey" json:"id"`
	Username        string               `gorm:"size:50;uniqueIndex" json:"username"`
	Email           string               `gorm:"size:100;uniqueIndex" json:"email"`
	Password        string               `gorm:"size:255" json:"-"`
	Role            string               `gorm:"size:20;default:user" json:"role"`
	Avatar          string               `gorm:"size:500" json:"avatar"`
	Bio             string               `gorm:"size:1000" json:"bio"`
	GithubURL       string               `gorm:"size:255;column:github_url" json:"github_url"`
	IsActive        bool                 `gorm:"default:true" json:"is_active"`
	LastLoginAt     *time.Time           `json:"last_login_at"`
	CreatedAt       time.Time            `json:"created_at"`
	UpdatedAt       time.Time            `json:"updated_at"`
	Books           []Book               `gorm:"foreignKey:UserID" json:"books,omitempty"`
	Authentications []UserAuthentication `gorm:"foreignKey:UserID" json:"authentications,omitempty"`
}

// UserAuthentication 第三方登录绑定
type UserAuthentication struct {
	ID               uint       `gorm:"primaryKey" json:"id"`
	UserID           uint       `gorm:"index;not null" json:"user_id"`
	Provider         string     `gorm:"size:20;not null;uniqueIndex:uk_provider" json:"provider"`
	ProviderID       string     `gorm:"size:255;not null;uniqueIndex:uk_provider" json:"provider_id"`
	ProviderUsername string     `gorm:"size:100" json:"provider_username"`
	ProviderEmail    string     `gorm:"size:255" json:"provider_email"`
	AccessToken      string     `gorm:"type:text" json:"-"`
	RefreshToken     string     `gorm:"type:text" json:"-"`
	TokenExpiresAt   *time.Time `json:"token_expires_at"`
	IsPrimary        bool       `json:"is_primary"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

// SiteConfig 站点键值配置
type SiteConfig struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	ConfigKey   string    `gorm:"size:50;uniqueIndex" json:"config_key"`
	ConfigValue string    `gorm:"type:text" json:"config_value"`
	Description string    `gorm:"size:255" json:"description"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// AuditLog 管理员高风险操作审计记录。Summary 仅保存脱敏后的 JSON 变更摘要。
type AuditLog struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	ActorID       uint      `gorm:"index;not null" json:"actor_id"`
	ActorUsername string    `gorm:"size:50;index;not null" json:"actor_username"`
	Action        string    `gorm:"size:80;index;not null" json:"action"`
	ResourceType  string    `gorm:"size:50;index;not null" json:"resource_type"`
	ResourceID    string    `gorm:"size:100;index;not null" json:"resource_id"`
	ResourceLabel string    `gorm:"size:255" json:"resource_label"`
	Summary       string    `gorm:"type:text;not null" json:"-"`
	CreatedAt     time.Time `gorm:"index;not null" json:"created_at"`
}

// Notification 站内通知（M13）
type Notification struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	UserID    uint       `gorm:"index;not null" json:"user_id"`
	Type      string     `gorm:"size:30;index" json:"type"` // comment | reaction | system | collaboration
	Title     string     `gorm:"size:255;not null" json:"title"`
	Payload   string     `gorm:"type:text" json:"payload"` // JSON 字符串，如 {"link":"/book/detail/x"}
	ReadAt    *time.Time `json:"read_at"`
	CreatedAt time.Time  `json:"created_at"`
}

// BookCollaborator 书籍协作者（M14；书籍所有者为 book.user_id，不在此表）
type BookCollaborator struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	BookID      uint       `gorm:"not null;uniqueIndex:uk_book_user" json:"book_id"`
	UserID      uint       `gorm:"not null;uniqueIndex:uk_book_user" json:"user_id"`
	Role        string     `gorm:"size:20;default:editor" json:"role"`           // editor | viewer
	Status      string     `gorm:"size:20;default:accepted;index" json:"status"` // pending | accepted | rejected
	InvitedBy   uint       `gorm:"index;default:0" json:"invited_by"`
	RespondedAt *time.Time `json:"responded_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	User        *User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Book        *Book      `gorm:"foreignKey:BookID" json:"book,omitempty"`
}

// PasswordResetToken 找回密码一次性令牌（M15；只存哈希，明文仅出现在邮件链接里）
type PasswordResetToken struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	UserID    uint       `gorm:"index;not null" json:"user_id"`
	TokenHash string     `gorm:"size:64;uniqueIndex;not null" json:"-"`
	ExpiresAt time.Time  `gorm:"index" json:"expires_at"`
	UsedAt    *time.Time `json:"used_at"`
	CreatedAt time.Time  `json:"created_at"`
}

// Book 书籍
type Book struct {
	ID               uint   `gorm:"primaryKey" json:"id"`
	Title            string `gorm:"size:255;not null" json:"title"`
	Description      string `gorm:"type:text" json:"description"`
	CoverImage       string `gorm:"size:500" json:"cover_image"`
	Slug             string `gorm:"size:255;uniqueIndex;not null" json:"slug"`
	UserID           uint   `gorm:"index;not null" json:"user_id"`
	Status           string `gorm:"size:20;default:draft;index" json:"status"` // draft | in_progress | published | completed | archived
	IsPublic         bool   `gorm:"default:false;index" json:"is_public"`
	ViewCount        int    `gorm:"default:0" json:"view_count"`
	OrderCol         string `gorm:"size:50;default:created_at" json:"order_col"`
	OrderDir         string `gorm:"size:10;default:desc" json:"order_dir"`
	ChapterPrefix    string `gorm:"size:20;default:''" json:"chapter_prefix"`
	WatermarkEnabled bool   `gorm:"default:false" json:"watermark_enabled"`
	WatermarkText    string `gorm:"size:255;default:''" json:"watermark_text"`
	// ExportEnabled 作者是否允许他人导出本书（公开书籍生效；作者/协作者不受限）
	ExportEnabled bool `gorm:"default:true" json:"export_enabled"`
	// ExportStyleShared 作者是否共享自己的导出样式：开启后他人导出本书可选用作者样式，否则只能用自己的
	ExportStyleShared bool           `gorm:"default:false" json:"export_style_shared"`
	User              *User          `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Tags              []Tag          `gorm:"many2many:book_tags" json:"tags,omitempty"`
	CreatedAt         time.Time      `json:"created_at"`
	UpdatedAt         time.Time      `json:"updated_at"`
	DeletedAt         gorm.DeletedAt `gorm:"index" json:"-"`
	DeletedBy         uint           `gorm:"index;default:0" json:"-"`
	TrashGroup        string         `gorm:"size:64;index" json:"-"`
	// ChapterCount 非持久化：列表接口按需回填的章节（文档）数量
	ChapterCount int `gorm:"-" json:"chapter_count"`
	// CollaboratorRole 非持久化：协作书籍列表按需回填当前用户的角色。
	CollaboratorRole string `gorm:"-" json:"collaborator_role,omitempty"`
}

// Tag 标签
type Tag struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"size:50;uniqueIndex;not null" json:"name"`
	Slug      string    `gorm:"size:50;uniqueIndex;not null" json:"slug"`
	BookCount int64     `gorm:"->" json:"book_count"` // 只读聚合列：公开书籍使用计数
	CreatedAt time.Time `json:"created_at"`
}

// Comment 章节评论：支持两级（parent_id 为空是顶层评论）
type Comment struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	DocumentID uint      `gorm:"index;not null" json:"document_id"`
	UserID     uint      `gorm:"index;not null" json:"user_id"`
	User       *User     `gorm:"foreignKey:UserID" json:"user,omitempty"`
	ParentID   *uint     `gorm:"index" json:"parent_id"`
	Parent     *Comment  `gorm:"foreignKey:ParentID" json:"-"`
	Content    string    `gorm:"type:text;not null" json:"content"`
	Status     string    `gorm:"size:20;default:published;index" json:"status"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// Reaction 点赞/收藏：每用户每书一条（like 或 favorite）
type Reaction struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"uniqueIndex:uk_user_book_type;not null" json:"user_id"`
	BookID    uint      `gorm:"uniqueIndex:uk_user_book_type;index;not null" json:"book_id"`
	Type      string    `gorm:"uniqueIndex:uk_user_book_type;size:20;not null" json:"type"` // like | favorite
	CreatedAt time.Time `json:"created_at"`
	User      *User     `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

// ReadingProgress 阅读进度：每个用户在每个书籍中最近读到的章节
type ReadingProgress struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"uniqueIndex:uk_user_book;not null" json:"user_id"`
	BookID    uint      `gorm:"uniqueIndex:uk_user_book;not null" json:"book_id"`
	DocID     uint      `gorm:"not null" json:"doc_id"`
	DocSlug   string    `gorm:"size:255;not null" json:"doc_slug"`
	DocTitle  string    `gorm:"size:255" json:"doc_title"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ReadChapter 记录用户读过的每个章节（用于详情页阅读进度标记），每用户每章一条
type ReadChapter struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"uniqueIndex:uk_user_doc;not null" json:"user_id"`
	BookID    uint      `gorm:"index;not null" json:"book_id"`
	DocID     uint      `gorm:"uniqueIndex:uk_user_doc;not null" json:"doc_id"`
	CreatedAt time.Time `json:"created_at"`
}

// Plugin 后台可安装插件（如 PDF 导出依赖的无头 Chrome）；未安装则相关功能不可用
type Plugin struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	Key         string     `gorm:"size:50;uniqueIndex;not null" json:"key"` // 如 pdf-export
	Installed   bool       `gorm:"default:false" json:"installed"`
	Version     string     `gorm:"size:50" json:"version"`
	Meta        string     `gorm:"type:text" json:"meta"` // JSON：如 {"chrome_path":"...","status":"downloading"}
	InstalledAt *time.Time `json:"installed_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// UserExportSetting 用户导出（PDF）样式偏好，每用户一条
type UserExportSetting struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	UserID       uint      `gorm:"uniqueIndex;not null" json:"user_id"`
	PageSize     string    `gorm:"size:10;default:A4" json:"page_size"` // A4 | Letter
	IncludeCover bool      `gorm:"default:true" json:"include_cover"`
	IncludeToc   bool      `gorm:"default:true" json:"include_toc"`
	FontSize     int       `gorm:"default:15" json:"font_size"`             // 正文字号 px
	CodeTheme    string    `gorm:"size:20;default:light" json:"code_theme"` // light | dark
	Margin       string    `gorm:"size:10;default:normal" json:"margin"`    // narrow | normal | wide
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// BookTag 书籍-标签联接表
type BookTag struct {
	BookID    uint      `gorm:"primaryKey" json:"book_id"`
	TagID     uint      `gorm:"primaryKey;index" json:"tag_id"`
	CreatedAt time.Time `json:"created_at"`
}

// Document 文档，支持 parent_id 构成树形结构
type Document struct {
	ID        uint   `gorm:"primaryKey" json:"id"`
	BookID    uint   `gorm:"index;not null;uniqueIndex:uk_book_slug" json:"book_id"`
	ParentID  *uint  `gorm:"index" json:"parent_id"`
	Title     string `gorm:"size:255;not null" json:"title"`
	Slug      string `gorm:"size:255;not null;uniqueIndex:uk_book_slug" json:"slug"`
	Content   string `gorm:"type:text" json:"content"`
	UserID    uint   `gorm:"index;not null" json:"user_id"`
	SortOrder int    `gorm:"default:0" json:"sort_order"`
	ViewCount int    `gorm:"default:0" json:"view_count"`
	Status    string `gorm:"size:20;default:draft;index" json:"status"`
	// 公开后允许评论；指针型保证显式 false 能写入（列默认 true）
	AllowComments *bool          `gorm:"default:true" json:"allow_comments"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
	DeletedBy     uint           `gorm:"index;default:0" json:"-"`
	TrashGroup    string         `gorm:"size:64;index" json:"-"`
	Children      []*Document    `gorm:"-" json:"children,omitempty"`
}

// DocumentRevision 章节不可变历史版本。只允许新增与读取，不提供更新接口。
type DocumentRevision struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	DocumentID    uint      `gorm:"index;not null" json:"document_id"`
	BookID        uint      `gorm:"index;not null" json:"book_id"`
	UserID        uint      `gorm:"index;not null" json:"user_id"`
	Title         string    `gorm:"size:255;not null" json:"title"`
	Content       string    `gorm:"type:text" json:"content"`
	Status        string    `gorm:"size:20;not null" json:"status"`
	AllowComments bool      `gorm:"not null;default:true" json:"allow_comments"`
	Reason        string    `gorm:"size:20;not null" json:"reason"` // create | save | publish | pre_restore | restore
	CreatedAt     time.Time `gorm:"index" json:"created_at"`
}

// All 执行多数据库迁移
func All(db *gorm.DB) error {
	return db.AutoMigrate(
		&User{},
		&UserAuthentication{},
		&SiteConfig{},
		&AuditLog{},
		&Book{},
		&Document{},
		&DocumentRevision{},
		&Tag{},
		&BookTag{},
		&ReadingProgress{},
		&ReadChapter{},
		&Plugin{},
		&UserExportSetting{},
		&Comment{},
		&Reaction{},
		&Notification{},
		&BookCollaborator{},
		&PasswordResetToken{},
	)
}
