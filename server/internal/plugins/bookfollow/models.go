package bookfollow

import "time"

// BookFollow 用户关注书籍：关注后收到该书更新（新章节/状态）通知。
// 该表为「书籍关注」插件独占，由插件在启用时 AutoMigrate 建表、卸载时按 Meta.Tables 清除。
// 表名由 GORM 依结构体名推导为 book_follows（与迁前一致，schema 不变）。
type BookFollow struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"uniqueIndex:uk_user_book_follow;not null" json:"user_id"`
	BookID    uint      `gorm:"uniqueIndex:uk_user_book_follow;index;not null" json:"book_id"`
	CreatedAt time.Time `json:"created_at"`
}
