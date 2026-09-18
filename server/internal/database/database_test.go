package database

import (
	"sync"
	"testing"

	"infosphere/server/internal/config"
	"infosphere/server/internal/models"

	"github.com/glebarez/sqlite"
	"gorm.io/driver/postgres"
	"gorm.io/gorm/schema"
)

// 大文本字段（如 documents.content、document_revisions.content）必须能承载超过
// MySQL text 64KB 上限的内容：MySQL 上推导为 longtext，SQLite/PostgreSQL 为 text。
// 回归背景：生产库已有超 64KB 的文档正文，AutoMigrate 曾按 text 收缩列类型导致
// Error 1406 "Data too long for column 'content'"，服务无法启动。

func TestMySQLDialectDerivesLongtextForUntaggedStrings(t *testing.T) {
	dialect := mysqlDialector(mysqlDSN(config.DatabaseConfig{Type: TypeMySQL}))
	parse, err := schema.Parse(&models.Document{}, &sync.Map{}, schema.NamingStrategy{})
	if err != nil {
		t.Fatalf("解析 Document schema 失败: %v", err)
	}
	for name, field := range parse.FieldsByDBName {
		if name != "content" {
			continue
		}
		if got := dialect.DataTypeOf(field); got != "longtext" {
			t.Fatalf("documents.content 在 MySQL 上应推导为 longtext，实际 %q", got)
		}
		return
	}
	t.Fatal("Document schema 中未找到 content 字段")
}

func TestMySQLDialectKeepsSizedStringsAsVarchar(t *testing.T) {
	dialect := mysqlDialector(mysqlDSN(config.DatabaseConfig{Type: TypeMySQL}))
	parse, err := schema.Parse(&models.Document{}, &sync.Map{}, schema.NamingStrategy{})
	if err != nil {
		t.Fatalf("解析 Document schema 失败: %v", err)
	}
	for name, field := range parse.FieldsByDBName {
		if name != "title" {
			continue
		}
		if got := dialect.DataTypeOf(field); got != "varchar(255)" {
			t.Fatalf("documents.title 在 MySQL 上应保持 varchar(255)，实际 %q", got)
		}
		return
	}
	t.Fatal("Document schema 中未找到 title 字段")
}

func TestSQLiteDialectMapsUntaggedStringsToText(t *testing.T) {
	dialect := sqlite.Open("file::memory:?cache=shared")
	parse, err := schema.Parse(&models.Document{}, &sync.Map{}, schema.NamingStrategy{})
	if err != nil {
		t.Fatalf("解析 Document schema 失败: %v", err)
	}
	for name, field := range parse.FieldsByDBName {
		if name != "content" {
			continue
		}
		if got := dialect.DataTypeOf(field); got != "text" {
			t.Fatalf("documents.content 在 SQLite 上应为 text，实际 %q", got)
		}
		return
	}
	t.Fatal("Document schema 中未找到 content 字段")
}

func TestPostgresDialectMapsUntaggedStringsToText(t *testing.T) {
	dialect := postgres.Open(postgresDSN(config.DatabaseConfig{Type: TypePostgres}))
	parse, err := schema.Parse(&models.Document{}, &sync.Map{}, schema.NamingStrategy{})
	if err != nil {
		t.Fatalf("解析 Document schema 失败: %v", err)
	}
	for name, field := range parse.FieldsByDBName {
		if name != "content" {
			continue
		}
		if got := dialect.DataTypeOf(field); got != "text" {
			t.Fatalf("documents.content 在 PostgreSQL 上应为 text，实际 %q", got)
		}
		return
	}
	t.Fatal("Document schema 中未找到 content 字段")
}
