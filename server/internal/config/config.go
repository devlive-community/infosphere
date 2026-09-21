package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// DatabaseConfig 数据库连接配置，支持 sqlite / mysql / postgres
type DatabaseConfig struct {
	Type     string `json:"type"` // sqlite | mysql | postgres
	Host     string `json:"host,omitempty"`
	Port     int    `json:"port,omitempty"`
	Name     string `json:"name,omitempty"`
	User     string `json:"user,omitempty"`
	Password string `json:"password,omitempty"`
	Path     string `json:"path,omitempty"` // sqlite 数据库文件路径
}

// Config 应用配置，安装完成后持久化到 dataDir/config.json
type Config struct {
	Installed   bool           `json:"installed"`
	Port        int            `json:"port"`
	Database    DatabaseConfig `json:"database"`
	Secret      string         `json:"secret"`
	InstalledAt string         `json:"installed_at,omitempty"`
}

// init 兼容旧品牌环境变量：项目由 InfoSphere 改名为 KnowForge 后，环境变量前缀
// INFO_SPHERE_* 改为 KNOWFORGE_*。为了让「仍使用旧 env 文件/密钥」的既有部署平滑升级，
// 启动时把未设置的 KNOWFORGE_X 用旧的 INFO_SPHERE_X 值补齐（新值优先）。全部代码只读新前缀。
func init() {
	for _, base := range []string{
		"DATA", "PORT", "WEB_PORT", "STATIC_ROOT", "API_URL",
		"UPGRADE", "UPSTREAM_REPO", "TRUSTED_PROXIES", "SITE_URL", "ENV_FILE",
	} {
		if os.Getenv("KNOWFORGE_"+base) == "" {
			if v := os.Getenv("INFO_SPHERE_" + base); v != "" {
				_ = os.Setenv("KNOWFORGE_"+base, v)
			}
		}
	}
}

// DataDir 返回数据目录，可通过环境变量 KNOWFORGE_DATA 覆盖（旧 INFO_SPHERE_DATA 亦兼容），默认 ./data
func DataDir() string {
	if dir := os.Getenv("KNOWFORGE_DATA"); dir != "" {
		return dir
	}
	return "./data"
}

// Load 读取配置文件，配置不存在时返回未安装的默认配置
func Load() (*Config, error) {
	cfg := &Config{
		Port: 6969,
		Database: DatabaseConfig{
			Type: "sqlite",
		},
	}

	path := filepath.Join(DataDir(), "config.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return cfg, nil
		}
		return nil, err
	}
	if err := json.Unmarshal(raw, cfg); err != nil {
		return nil, fmt.Errorf("解析配置文件失败: %w", err)
	}
	if cfg.Port <= 0 {
		cfg.Port = 6969
	}
	return cfg, nil
}

// Save 将配置持久化到数据目录
func (c *Config) Save() error {
	if err := os.MkdirAll(DataDir(), 0o755); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	path := filepath.Join(DataDir(), "config.json")
	return os.WriteFile(path, raw, 0o600)
}

// ListenPort 服务监听端口：命令行 / 环境变量优先于配置文件
func (c *Config) ListenPort(flagPort int) int {
	if flagPort > 0 {
		return flagPort
	}
	if p := os.Getenv("KNOWFORGE_PORT"); p != "" {
		var port int
		if _, err := fmt.Sscanf(p, "%d", &port); err == nil && port > 0 {
			return port
		}
	}
	return c.Port
}
