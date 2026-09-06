// Package legacy 将旧版 InfoSphere（Node.js + MySQL）数据迁移到新版数据库。
//
// 旧版 schema（backend/scripts/schema.sql + 后续演进）：
//   - users(id, username, email, password(bcrypt), role, avatar, last_login_at,
//     is_active, bio, github_url, created_at, updated_at)
//   - books(id, title, description, cover_image, slug, user_id, status, is_public,
//     view_count, order_col?, order_dir?, chapter_prefix?, created_at, updated_at)
//   - documents(id, book_id, parent_id, title, slug, content, user_id, sort_order,
//     status, created_at, updated_at)
//   - user_authentications(user_id, provider, provider_id, provider_username,
//     provider_email, access_token, refresh_token, token_expires_at, is_primary)
//   - site_configs(config_key, config_value, description)
//
// 兼容策略：按列名读取（旧库可能缺 order_col 等后增列）；bcrypt 哈希原样平移；
// 以唯一键跳过已存在记录，重复执行幂等。
package legacy

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	"infosphere/server/internal/models"

	"gorm.io/gorm"
)

// Summary 迁移结果统计
type Summary struct {
	Users        int `json:"users"`
	UsersSkipped int `json:"users_skipped"`
	Books        int `json:"books"`
	BooksSkipped int `json:"books_skipped"`
	Documents    int `json:"documents"`
	Auths        int `json:"user_authentications"`
	AuthsSkipped int `json:"user_authentications_skipped"`
	SiteConfigs  int `json:"site_configs"`
}

// reservedConfigKeys 旧站点配置中不迁入的键（由新版安装/升级自行维护）
var reservedConfigKeys = map[string]bool{"version": true, "installation_date": true}

// RunMigration 执行迁移；target 为已安装的新版数据库，legacy 为旧库连接。
// dryRun 只统计不写入（可重复执行核对数量）。
func RunMigration(target *gorm.DB, legacy *sql.DB, dryRun bool) (*Summary, error) {
	summary := &Summary{}

	// 旧 ID → 新 ID；被跳过的用户也可通过用户名/邮箱解析到目标记录
	userIDMap := map[uint]uint{}
	// dry-run 中将要迁移但尚未写入的用户：视为可解析
	pendingUsers := map[uint]bool{}
	resolveUser := func(oldID int64, username, email string) (uint, bool) {
		if id, ok := userIDMap[uint(oldID)]; ok {
			return id, true
		}
		if pendingUsers[uint(oldID)] {
			return 0, true
		}
		if username == "" && email == "" {
			return 0, false
		}
		var u models.User
		q := target.Where("username = ?", username)
		if email != "" {
			q = q.Or("email = ?", email)
		}
		if err := q.First(&u).Error; err != nil {
			return 0, false
		}
		userIDMap[uint(oldID)] = u.ID
		return u.ID, true
	}

	// ── 1. 用户 ──
	users, err := readRows(legacy, `SELECT id, username, email, password, role, avatar,
		last_login_at, is_active, bio, github_url, created_at FROM users ORDER BY id`)
	if err != nil {
		return nil, fmt.Errorf("读取旧 users 失败: %w", err)
	}
	for _, u := range users {
		username := strings.TrimSpace(str(u, "username"))
		email := strings.TrimSpace(str(u, "email"))
		oldID := num(u, "id")
		if username == "" {
			summary.UsersSkipped++
			continue
		}
		var count int64
		q := target.Model(&models.User{}).Where("username = ?", username)
		if email != "" {
			q = q.Or("email = ?", email)
		}
		q.Count(&count)
		if count > 0 {
			summary.UsersSkipped++
			resolveUser(oldID, username, email) // 便于后续书籍/章节挂接
			continue
		}
		summary.Users++
		pendingUsers[uint(oldID)] = true
		if dryRun {
			continue
		}
		nu := models.User{
			Username:    username,
			Email:       email,
			Password:    str(u, "password"), // bcrypt 哈希原样平移，登录校验兼容
			Role:        orDefault(str(u, "role"), "user"),
			Avatar:      str(u, "avatar"),
			Bio:         str(u, "bio"),
			GithubURL:   str(u, "github_url"),
			IsActive:    boolOf(u["is_active"], true),
			LastLoginAt: timePtr(u["last_login_at"]),
			CreatedAt:   timeOf(u["created_at"], time.Now()),
			UpdatedAt:   timeOf(u["created_at"], time.Now()),
		}
		if err := target.Create(&nu).Error; err != nil {
			return nil, fmt.Errorf("写入用户 %s 失败: %w", username, err)
		}
		userIDMap[uint(oldID)] = nu.ID
	}

	// dry-run 中将要迁移但尚未写入的书籍：章节仅计数
	pendingBooks := map[uint]bool{}

	// ── 2. 书籍 ──
	books, err := readRows(legacy, `SELECT * FROM books ORDER BY id`)
	if err != nil {
		return nil, fmt.Errorf("读取旧 books 失败: %w", err)
	}
	bookIDMap := map[uint]uint{}
	bookAuthor := map[uint]uint{} // 新书 ID → 新作者 ID（章节作者兜底）
	for _, b := range books {
		slug := strings.TrimSpace(str(b, "slug"))
		oldID := num(b, "id")
		newUserID, ok := resolveUser(num(b, "user_id"), "", "")
		if slug == "" || !ok {
			summary.BooksSkipped++
			continue
		}
		var count int64
		target.Model(&models.Book{}).Where("slug = ?", slug).Count(&count)
		if count > 0 {
			summary.BooksSkipped++
			continue
		}
		summary.Books++
		pendingBooks[uint(oldID)] = true
		if dryRun {
			continue
		}
		created := timeOf(b["created_at"], time.Now())
		nb := models.Book{
			Title:         str(b, "title"),
			Description:   str(b, "description"),
			CoverImage:    str(b, "cover_image"),
			Slug:          slug,
			UserID:        newUserID,
			Status:        orDefault(str(b, "status"), "draft"),
			IsPublic:      boolOf(b["is_public"], false),
			ViewCount:     int(num(b, "view_count")),
			OrderCol:      orDefault(str(b, "order_col"), "created_at"),
			OrderDir:      orDefault(strings.ToLower(str(b, "order_dir")), "desc"),
			ChapterPrefix: str(b, "chapter_prefix"),
			CreatedAt:     created,
			UpdatedAt:     timeOf(b["updated_at"], created),
		}
		if err := target.Create(&nb).Error; err != nil {
			return nil, fmt.Errorf("写入书籍 %s 失败: %w", slug, err)
		}
		bookIDMap[uint(oldID)] = nb.ID
		bookAuthor[nb.ID] = newUserID
	}

	// ── 3. 章节（先建全部，再按旧 parent_id 映射挂树）──
	docs, err := readRows(legacy, `SELECT id, book_id, parent_id, title, slug, content, user_id,
		sort_order, status, created_at, updated_at FROM documents ORDER BY id`)
	if err != nil {
		return nil, fmt.Errorf("读取旧 documents 失败: %w", err)
	}
	docIDMap := map[uint]uint{}
	type parentLink struct {
		newDocID  uint
		oldParent uint
	}
	var links []parentLink
	for _, d := range docs {
		oldBookID := uint(num(d, "book_id"))
		newBookID, ok := bookIDMap[oldBookID]
		if !ok {
			if pendingBooks[oldBookID] { // dry-run：书籍尚未写入，仅计数
				summary.Documents++
			}
			continue // 所属书籍被跳过
		}
		author, ok := userIDMap[uint(num(d, "user_id"))]
		if !ok {
			author = bookAuthor[newBookID] // 作者缺失时归书籍作者
		}
		created := timeOf(d["created_at"], time.Now())
		summary.Documents++
		if dryRun {
			continue
		}
		nd := models.Document{
			BookID:    newBookID,
			Title:     str(d, "title"),
			Slug:      str(d, "slug"),
			Content:   str(d, "content"),
			UserID:    author,
			SortOrder: int(num(d, "sort_order")),
			Status:    orDefault(str(d, "status"), "draft"),
			CreatedAt: created,
			UpdatedAt: timeOf(d["updated_at"], created),
		}
		if err := target.Create(&nd).Error; err != nil {
			return nil, fmt.Errorf("写入章节 %s 失败: %w", nd.Slug, err)
		}
		docIDMap[uint(num(d, "id"))] = nd.ID
		if d["parent_id"] != nil {
			links = append(links, parentLink{newDocID: nd.ID, oldParent: uint(num(d, "parent_id"))})
		}
	}
	for _, l := range links {
		if newParentID, ok := docIDMap[l.oldParent]; ok {
			target.Model(&models.Document{}).Where("id = ?", l.newDocID).Update("parent_id", newParentID)
		}
	}

	// ── 4. 第三方登录绑定 ──
	auths, err := readRows(legacy, `SELECT id, user_id, provider, provider_id, provider_username,
		provider_email, access_token, refresh_token, token_expires_at, is_primary FROM user_authentications`)
	if err != nil {
		log.Printf("[migrate] 读取旧 user_authentications 失败（可能无此表，跳过）: %v", err)
		auths = nil
	}
	for _, au := range auths {
		newUserID, ok := resolveUser(num(au, "user_id"), "", "")
		if !ok {
			continue
		}
		var count int64
		target.Model(&models.UserAuthentication{}).
			Where("provider = ? AND provider_id = ?", str(au, "provider"), str(au, "provider_id")).
			Count(&count)
		if count > 0 {
			summary.AuthsSkipped++
			continue
		}
		summary.Auths++
		if dryRun {
			continue
		}
		na := models.UserAuthentication{
			UserID:           newUserID,
			Provider:         str(au, "provider"),
			ProviderID:       str(au, "provider_id"),
			ProviderUsername: str(au, "provider_username"),
			ProviderEmail:    str(au, "provider_email"),
			AccessToken:      str(au, "access_token"),
			RefreshToken:     str(au, "refresh_token"),
			TokenExpiresAt:   timePtr(au["token_expires_at"]),
			IsPrimary:        boolOf(au["is_primary"], false),
		}
		if err := target.Create(&na).Error; err != nil {
			log.Printf("[migrate] 写入第三方绑定失败 user=%d provider=%s: %v", newUserID, na.Provider, err)
			summary.Auths--
		}
	}

	// ── 5. 站点配置（保留目标已存在的值）──
	configs, err := readRows(legacy, `SELECT config_key, config_value, description FROM site_configs`)
	if err != nil {
		log.Printf("[migrate] 读取旧 site_configs 失败（可能无此表，跳过）: %v", err)
		configs = nil
	}
	for _, sc := range configs {
		key := str(sc, "config_key")
		if key == "" || reservedConfigKeys[key] {
			continue
		}
		var cfg models.SiteConfig
		if err := target.Where("config_key = ?", key).First(&cfg).Error; err == nil {
			continue // 目标已有该配置，保留现值
		}
		if dryRun {
			summary.SiteConfigs++
			continue
		}
		nc := models.SiteConfig{ConfigKey: key, ConfigValue: str(sc, "config_value"), Description: str(sc, "description")}
		if err := target.Create(&nc).Error; err != nil {
			log.Printf("[migrate] 写入站点配置 %s 失败: %v", key, err)
			continue
		}
		summary.SiteConfigs++
	}

	return summary, nil
}

// ── 通用读取辅助：按列名取值，容忍旧库缺列/空值 ──

// readRows 以列名为键读取整个结果集；文本列统一转为 string，由驱动 parseTime
// 参数决定时间列是否解析为 time.Time
func readRows(db *sql.DB, query string) ([]map[string]any, error) {
	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	var out []map[string]any
	for rows.Next() {
		values := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range values {
			ptrs[i] = &values[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		m := make(map[string]any, len(cols))
		for i, c := range cols {
			v := values[i]
			if raw, ok := v.([]byte); ok {
				m[c] = string(raw)
			} else {
				m[c] = v
			}
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func str(m map[string]any, key string) string {
	if v, ok := m[key]; ok && v != nil {
		if s, ok := v.(string); ok {
			return s
		}
		return fmt.Sprintf("%v", v)
	}
	return ""
}

func num(m map[string]any, key string) int64 {
	if v, ok := m[key]; ok && v != nil {
		switch t := v.(type) {
		case int64:
			return t
		case float64:
			return int64(t)
		}
	}
	return 0
}

func boolOf(v any, fallback bool) bool {
	if v == nil {
		return fallback
	}
	switch t := v.(type) {
	case bool:
		return t
	case int64:
		return t != 0
	case string:
		return t == "1" || strings.EqualFold(t, "true")
	}
	return fallback
}

func timeOf(v any, fallback time.Time) time.Time {
	if t, ok := v.(time.Time); ok {
		return t
	}
	return fallback
}

func timePtr(v any) *time.Time {
	if t, ok := v.(time.Time); ok {
		return &t
	}
	return nil
}

func orDefault(v, fallback string) string {
	if strings.TrimSpace(v) == "" {
		return fallback
	}
	return v
}
