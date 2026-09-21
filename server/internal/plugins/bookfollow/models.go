package bookfollow

import "time"

// BookFollow 用户关注书籍：关注后收到该书更新（新章节/状态）通知。
// 该表为「书籍关注」插件独占，插件启用时 AutoMigrate 建表；禁用只停用功能、保留数据，
// 仅当管理员在后台显式「清除数据」（purge）时才按 Meta.Tables 删表。
// 表名由 GORM 依结构体名推导为 book_follows（与迁前一致，schema 不变）。
type BookFollow struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"uniqueIndex:uk_user_book_follow;not null" json:"user_id"`
	BookID    uint      `gorm:"uniqueIndex:uk_user_book_follow;index;not null" json:"book_id"`
	CreatedAt time.Time `json:"created_at"`
}
