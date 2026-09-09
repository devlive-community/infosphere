package app

import (
	"fmt"
	"log"
	"strings"

	"gorm.io/gorm"
)

type searchBackend string

const (
	searchBackendLike     searchBackend = "like"
	searchBackendSQLite   searchBackend = "sqlite_fts5"
	searchBackendMySQL    searchBackend = "mysql_fulltext"
	searchBackendPostgres searchBackend = "postgres_tsvector"
)

// configureSearchBackend 尽力启用当前数据库的原生全文索引。索引不可用或数据库
// 账户没有建索引权限时不阻断启动，搜索会自动退回到跨方言 LIKE 查询。
func configureSearchBackend(db *gorm.DB) searchBackend {
	if db == nil {
		return searchBackendLike
	}
	var backend searchBackend
	var err error
	switch db.Dialector.Name() {
	case "sqlite":
		backend, err = configureSQLiteSearch(db)
	case "mysql":
		backend, err = configureMySQLSearch(db)
	case "postgres":
		backend, err = configurePostgresSearch(db)
	default:
		return searchBackendLike
	}
	if err != nil {
		log.Printf("全文搜索索引不可用，已回退 LIKE: %v", err)
		return searchBackendLike
	}
	return backend
}

func configureSQLiteSearch(db *gorm.DB) (searchBackend, error) {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS infosphere_search_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
		`CREATE VIRTUAL TABLE IF NOT EXISTS books_search_fts USING fts5(title, description, content='books', content_rowid='id', tokenize='trigram')`,
		`CREATE VIRTUAL TABLE IF NOT EXISTS documents_search_fts USING fts5(title, content, content='documents', content_rowid='id', tokenize='trigram')`,
		`CREATE TRIGGER IF NOT EXISTS books_search_fts_ai AFTER INSERT ON books BEGIN
			INSERT INTO books_search_fts(rowid, title, description) VALUES (new.id, new.title, new.description); END`,
		`CREATE TRIGGER IF NOT EXISTS books_search_fts_ad AFTER DELETE ON books BEGIN
			INSERT INTO books_search_fts(books_search_fts, rowid, title, description) VALUES ('delete', old.id, old.title, old.description); END`,
		`CREATE TRIGGER IF NOT EXISTS books_search_fts_au AFTER UPDATE OF title, description ON books BEGIN
			INSERT INTO books_search_fts(books_search_fts, rowid, title, description) VALUES ('delete', old.id, old.title, old.description);
			INSERT INTO books_search_fts(rowid, title, description) VALUES (new.id, new.title, new.description); END`,
		`CREATE TRIGGER IF NOT EXISTS documents_search_fts_ai AFTER INSERT ON documents BEGIN
			INSERT INTO documents_search_fts(rowid, title, content) VALUES (new.id, new.title, new.content); END`,
		`CREATE TRIGGER IF NOT EXISTS documents_search_fts_ad AFTER DELETE ON documents BEGIN
			INSERT INTO documents_search_fts(documents_search_fts, rowid, title, content) VALUES ('delete', old.id, old.title, old.content); END`,
		`CREATE TRIGGER IF NOT EXISTS documents_search_fts_au AFTER UPDATE OF title, content ON documents BEGIN
			INSERT INTO documents_search_fts(documents_search_fts, rowid, title, content) VALUES ('delete', old.id, old.title, old.content);
			INSERT INTO documents_search_fts(rowid, title, content) VALUES (new.id, new.title, new.content); END`,
	}
	for _, statement := range statements {
		if err := db.Exec(statement).Error; err != nil {
			return searchBackendLike, err
		}
	}
	var version string
	if err := db.Raw("SELECT value FROM infosphere_search_meta WHERE key = ?", "fts_schema").Scan(&version).Error; err != nil {
		return searchBackendLike, err
	}
	if version != "fts5-trigram-v1" {
		if err := db.Exec("INSERT INTO books_search_fts(books_search_fts) VALUES ('rebuild')").Error; err != nil {
			return searchBackendLike, err
		}
		if err := db.Exec("INSERT INTO documents_search_fts(documents_search_fts) VALUES ('rebuild')").Error; err != nil {
			return searchBackendLike, err
		}
		if err := db.Exec(`INSERT INTO infosphere_search_meta(key, value) VALUES (?, ?)
			ON CONFLICT(key) DO UPDATE SET value = excluded.value`, "fts_schema", "fts5-trigram-v1").Error; err != nil {
			return searchBackendLike, err
		}
	}
	return searchBackendSQLite, nil
}

func configureMySQLSearch(db *gorm.DB) (searchBackend, error) {
	indexes := []struct {
		table, name, columns string
	}{
		{"books", "idx_books_fulltext", "title, description"},
		{"documents", "idx_documents_fulltext", "title, content"},
	}
	for _, index := range indexes {
		var count int64
		if err := db.Raw(`SELECT COUNT(*) FROM information_schema.statistics
			WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`, index.table, index.name).Scan(&count).Error; err != nil {
			return searchBackendLike, err
		}
		if count == 0 {
			if err := db.Exec(fmt.Sprintf("CREATE FULLTEXT INDEX %s ON %s (%s)", index.name, index.table, index.columns)).Error; err != nil {
				return searchBackendLike, err
			}
		}
	}
	return searchBackendMySQL, nil
}

func configurePostgresSearch(db *gorm.DB) (searchBackend, error) {
	statements := []string{
		`CREATE INDEX IF NOT EXISTS idx_books_fulltext ON books USING GIN (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, '')))`,
		`CREATE INDEX IF NOT EXISTS idx_documents_fulltext ON documents USING GIN (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, '')))`,
	}
	for _, statement := range statements {
		if err := db.Exec(statement).Error; err != nil {
			return searchBackendLike, err
		}
	}
	return searchBackendPostgres, nil
}

func sqliteFTSQuery(q string) string {
	parts := strings.Fields(q)
	quoted := make([]string, 0, len(parts))
	for _, part := range parts {
		if len([]rune(part)) < 3 {
			return ""
		}
		part = strings.ReplaceAll(part, `"`, `""`)
		if part != "" {
			quoted = append(quoted, `"`+part+`"`)
		}
	}
	return strings.Join(quoted, " AND ")
}
