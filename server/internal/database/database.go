package database

import (
	"database/sql"
	"fmt"

	"infosphere/server/internal/config"

	"github.com/glebarez/sqlite"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

const (
	TypeSQLite   = "sqlite"
	TypeMySQL    = "mysql"
	TypePostgres = "postgres"
)

// SupportedTypes 安装向导中可选的数据库类型
func SupportedTypes() []string {
	return []string{TypeSQLite, TypeMySQL, TypePostgres}
}

func Supported(t string) bool {
	for _, item := range SupportedTypes() {
		if item == t {
			return true
		}
	}
	return false
}

func mysqlDSN(cfg config.DatabaseConfig) string {
	if cfg.Port == 0 {
		cfg.Port = 3306
	}
	return fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		cfg.User, cfg.Password, cfg.Host, cfg.Port, cfg.Name)
}

func postgresDSN(cfg config.DatabaseConfig) string {
	if cfg.Port == 0 {
		cfg.Port = 5432
	}
	return fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.Name)
}

// Open 根据配置打开 GORM 连接
func Open(cfg config.DatabaseConfig) (*gorm.DB, error) {
	switch cfg.Type {
	case TypeSQLite:
		path := cfg.Path
		if path == "" {
			path = "./data/infosphere.db"
		}
		return gorm.Open(sqlite.Open(path+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)"), &gorm.Config{})
	case TypeMySQL:
		return gorm.Open(mysql.Open(mysqlDSN(cfg)), &gorm.Config{})
	case TypePostgres:
		return gorm.Open(postgres.Open(postgresDSN(cfg)), &gorm.Config{})
	default:
		return nil, fmt.Errorf("不支持的数据库类型: %s", cfg.Type)
	}
}

// Ping 验证数据库连通性
func Ping(gdb *gorm.DB) error {
	sqlDB, err := gdb.DB()
	if err != nil {
		return err
	}
	return sqlDB.Ping()
}

// Test 使用给定配置测试数据库连接，返回 *sql.DB 便于调用方关闭
func Test(cfg config.DatabaseConfig) (*sql.DB, error) {
	gdb, err := Open(cfg)
	if err != nil {
		return nil, err
	}
	sqlDB, err := gdb.DB()
	if err != nil {
		return nil, err
	}
	if err := sqlDB.Ping(); err != nil {
		_ = sqlDB.Close()
		return nil, err
	}
	return sqlDB, nil
}
