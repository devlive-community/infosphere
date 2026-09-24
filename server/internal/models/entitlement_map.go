package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
)

// EntitlementMap 权益配置（权益键 → 取值），以 JSON 文本存储；用于等级、会员方案等权益来源。
// 未出现的键表示「不设置」（由更低优先级来源或基础值决定）。
type EntitlementMap map[string]int64

// Value 实现 driver.Valuer：空映射存为 "{}"。
func (m EntitlementMap) Value() (driver.Value, error) {
	if len(m) == 0 {
		return "{}", nil
	}
	raw, err := json.Marshal(map[string]int64(m))
	return string(raw), err
}

// Scan 实现 sql.Scanner：兼容空值、字符串与字节切片。
func (m *EntitlementMap) Scan(src any) error {
	out := EntitlementMap{}
	switch v := src.(type) {
	case nil:
	case string:
		if v != "" {
			if err := json.Unmarshal([]byte(v), &out); err != nil {
				return err
			}
		}
	case []byte:
		if len(v) > 0 {
			if err := json.Unmarshal(v, &out); err != nil {
				return err
			}
		}
	default:
		return fmt.Errorf("EntitlementMap: 不支持的类型 %T", src)
	}
	*m = out
	return nil
}
