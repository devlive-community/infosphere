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

// DataDir 返回数据目录，可通过环境变量 INFO_SPHERE_DATA 覆盖，默认 ./data
func DataDir() string {
	if dir := os.Getenv("INFO_SPHERE_DATA"); dir != "" {
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
	if p := os.Getenv("INFO_SPHERE_PORT"); p != "" {
		var port int
		if _, err := fmt.Sscanf(p, "%d", &port); err == nil && port > 0 {
			return port
		}
	}
	return c.Port
}
