// migrate-legacy 将旧版 InfoSphere（Node.js + MySQL）数据迁移到新版数据库。
//
// 前提：目标库已完成新版安装向导（data/config.json 的 installed=true）。
//
// 用法：
//
//	go run ./cmd/migrate-legacy -legacy-dsn "user:pass@tcp(127.0.0.1:3306)/infosphere"
//	go run ./cmd/migrate-legacy -legacy-dsn "..." -dry-run   # 只统计不写入
//
// 目标库通过常规 INFO_SPHERE_* 环境变量/配置文件定位（与主服务一致）。
// 密码哈希（bcrypt）原样平移，迁移后用户可直接用原密码登录；
// 用户名/邮箱、书籍 slug、第三方绑定 (provider,provider_id) 已存在的记录自动跳过，
// 可重复执行（幂等），最终输出各实体的迁移/跳过数量。
package main

import (
	"database/sql"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"

	"infosphere/server/internal/config"
	"infosphere/server/internal/database"
	"infosphere/server/internal/legacy"
	"infosphere/server/internal/models"

	_ "github.com/go-sql-driver/mysql"
)

func main() {
	legacyDSN := flag.String("legacy-dsn", os.Getenv("LEGACY_MYSQL_DSN"),
		"旧库 MySQL DSN，例如 user:pass@tcp(127.0.0.1:3306)/infosphere")
	dryRun := flag.Bool("dry-run", false, "只统计可迁移数量，不写入")
	flag.Parse()

	if strings.TrimSpace(*legacyDSN) == "" {
		log.Fatal("请通过 -legacy-dsn 或环境变量 LEGACY_MYSQL_DSN 提供旧库连接串")
	}

	// ── 目标库：必须已完成安装 ──
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("加载目标配置失败: %v", err)
	}
	if !cfg.Installed {
		log.Fatal("目标数据库尚未安装，请先访问 /install 完成安装向导再迁移")
	}
	target, err := database.Open(cfg.Database)
	if err != nil {
		log.Fatalf("打开目标数据库失败: %v", err)
	}
	if err := database.Ping(target); err != nil {
		log.Fatalf("连接目标数据库失败: %v", err)
	}
	// 幂等迁移：确保新库表结构与当前版本一致
	if err := models.All(target); err != nil {
		log.Fatalf("目标库迁移校验失败: %v", err)
	}

	// ── 旧库：追加 parseTime 让时间列返回 time.Time ──
	dsn := *legacyDSN
	if !strings.Contains(dsn, "parseTime=") {
		sep := "?"
		if strings.Contains(dsn, "?") {
			sep = "&"
		}
		dsn += sep + "parseTime=true"
	}
	legacyDB, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("打开旧数据库失败: %v", err)
	}
	defer legacyDB.Close()
	if err := legacyDB.Ping(); err != nil {
		log.Fatalf("连接旧数据库失败: %v", err)
	}

	if *dryRun {
		fmt.Println("—— dry-run：只统计不写入 ——")
	}
	summary, err := legacy.RunMigration(target, legacyDB, *dryRun)
	if err != nil {
		log.Fatalf("迁移失败: %v", err)
	}

	fmt.Printf("—— 迁移完成 ——\n")
	fmt.Printf("用户            新迁入 %d，跳过 %d\n", summary.Users, summary.UsersSkipped)
	fmt.Printf("书籍            新迁入 %d，跳过 %d\n", summary.Books, summary.BooksSkipped)
	fmt.Printf("章节            新迁入 %d\n", summary.Documents)
	fmt.Printf("第三方登录绑定  新迁入 %d，跳过 %d\n", summary.Auths, summary.AuthsSkipped)
	fmt.Printf("站点配置        新迁入 %d\n", summary.SiteConfigs)
}
