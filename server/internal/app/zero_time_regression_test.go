package app

import (
	"testing"

	"knowforge/server/internal/models"
)

// 回归：首次登录失败写入的锁定记录不能含零值时间（MySQL 严格模式拒绝 '0000-00-00'，会导致锁定永不生效）。
func TestLoginLockoutHasNoZeroTimes(t *testing.T) {
	a, _, db := newContentImportTestApp(t)
	_ = a.setSetting(cfgLockoutEnabled, "true", "test")
	a.recordLoginFailure("zero-time-user")
	var l models.LoginLockout
	if err := db.Where("username = ?", "zero-time-user").First(&l).Error; err != nil {
		t.Fatalf("应写入锁定记录: %v", err)
	}
	if l.WindowStart.IsZero() || l.LockedUntil.IsZero() {
		t.Fatalf("锁定记录的时间字段不应为零值: %+v", l)
	}
}
