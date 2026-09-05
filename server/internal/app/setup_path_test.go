package app

import (
	"path/filepath"
	"strings"
	"testing"

	"infosphere/server/internal/config"
)

func TestNormalizeSQLitePath(t *testing.T) {
	dataDir := t.TempDir()
	t.Setenv("INFO_SPHERE_DATA", dataDir)

	// 空路径 → 数据目录默认值
	cfg := config.DatabaseConfig{Type: "sqlite"}
	if err := normalizeDBConfig(&cfg); err != nil {
		t.Fatalf("空路径应使用默认值: %v", err)
	}
	if cfg.Path != filepath.Join(dataDir, "infosphere.db") {
		t.Fatalf("默认路径错误: %s", cfg.Path)
	}

	// 相对路径 → 解析到数据目录
	cfg = config.DatabaseConfig{Type: "sqlite", Path: "custom/book.db"}
	if err := normalizeDBConfig(&cfg); err != nil {
		t.Fatalf("相对路径应解析成功: %v", err)
	}
	if cfg.Path != filepath.Join(dataDir, "custom", "book.db") {
		t.Fatalf("相对路径应基于数据目录解析: %s", cfg.Path)
	}

	// 可写的绝对路径 → 保留
	abs := filepath.Join(t.TempDir(), "abs", "infosphere.db")
	cfg = config.DatabaseConfig{Type: "sqlite", Path: abs}
	if err := normalizeDBConfig(&cfg); err != nil {
		t.Fatalf("可写绝对路径应通过: %v", err)
	}
	if cfg.Path != abs {
		t.Fatalf("绝对路径不应被改写: %s", cfg.Path)
	}

	// 不可写的绝对路径 → 明确报错（模拟 systemd 沙箱只读文件系统：/proc 已存在但只读）
	cfg = config.DatabaseConfig{Type: "sqlite", Path: "/proc/infosphere.db"}
	err := normalizeDBConfig(&cfg)
	if err == nil {
		t.Fatal("不可写目录应报错")
	}
	if !strings.Contains(err.Error(), "不可写") {
		t.Fatalf("错误信息应说明不可写: %v", err)
	}
}
