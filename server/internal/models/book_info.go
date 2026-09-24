package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
)

// BookInfoItem 书籍「更多信息」中的一项附加属性（如 GitHub 仓库、原始文档地址、许可证），在书籍详情页展示。
// Type 为预置类型（决定图标与校验，见 app.bookInfoTypes）或 custom；Label 为自定义显示名（custom 必填，其余可覆盖默认名）。
type BookInfoItem struct {
	Type  string `json:"type"`
	Label string `json:"label,omitempty"`
	Value string `json:"value"`
}

// BookInfo 书籍附加属性列表（按展示顺序），以 JSON 存于单列。
type BookInfo []BookInfoItem

// Value 实现 driver.Valuer。
func (b BookInfo) Value() (driver.Value, error) {
	if len(b) == 0 {
		return "[]", nil
	}
	raw, err := json.Marshal([]BookInfoItem(b))
	return string(raw), err
}

// Scan 实现 sql.Scanner：兼容空值、字符串与字节切片。
func (b *BookInfo) Scan(src any) error {
	out := BookInfo{}
	var raw []byte
	switch v := src.(type) {
	case nil:
	case string:
		raw = []byte(v)
	case []byte:
		raw = v
	default:
		return fmt.Errorf("BookInfo: 不支持的类型 %T", src)
	}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &out); err != nil {
			return err
		}
	}
	*b = out
	return nil
}
