//! 桌面端本地存储：用 SQLite 保存已连接的服务器与登录令牌。
//!
//! 设计要点：
//! - `servers` 表按服务器地址存储名称与令牌（令牌来自 web 端登录，经注入脚本回写）；
//! - `app_state` 表用 `active_server` 记录当前激活的服务器；
//! - 令牌按“服务器”而非“会话”持有，切换服务器即切换令牌。

use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;

/// 供前端展示的服务器条目（不含令牌明文，只暴露是否已登录）。
#[derive(serde::Serialize, Clone)]
pub struct ServerRow {
    pub url: String,
    pub name: Option<String>,
    pub has_token: bool,
    pub updated_at: i64,
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub struct Store {
    conn: Connection,
}

impl Store {
    /// 打开（必要时创建）数据库并建表。
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             CREATE TABLE IF NOT EXISTS servers (
                 url        TEXT PRIMARY KEY,
                 name       TEXT,
                 token      TEXT,
                 updated_at INTEGER NOT NULL DEFAULT 0
             );
             CREATE TABLE IF NOT EXISTS app_state (
                 key   TEXT PRIMARY KEY,
                 value TEXT
             );",
        )?;
        Ok(Self { conn })
    }

    /// 新增或更新一条服务器记录（保留既有令牌与名称）。
    pub fn upsert_server(&self, url: &str, name: Option<&str>) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO servers (url, name, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(url) DO UPDATE SET name = COALESCE(?2, name), updated_at = ?3",
            params![url, name, now()],
        )?;
        Ok(())
    }

    /// 删除一条服务器记录；若删除的是激活服务器，一并清除激活标记。
    pub fn remove_server(&self, url: &str) -> rusqlite::Result<()> {
        self.conn
            .execute("DELETE FROM servers WHERE url = ?1", params![url])?;
        if self.active_server()?.as_deref() == Some(url) {
            self.clear_active()?;
        }
        Ok(())
    }

    /// 按最近更新时间倒序列出全部服务器。
    pub fn list_servers(&self) -> rusqlite::Result<Vec<ServerRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT url, name, (token IS NOT NULL AND token <> ''), updated_at
             FROM servers ORDER BY updated_at DESC",
        )?;
        let rows = stmt
            .query_map([], |r| {
                Ok(ServerRow {
                    url: r.get(0)?,
                    name: r.get(1)?,
                    has_token: r.get::<_, i64>(2)? != 0,
                    updated_at: r.get(3)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    /// 设为激活服务器。
    pub fn set_active(&self, url: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO app_state (key, value) VALUES ('active_server', ?1)
             ON CONFLICT(key) DO UPDATE SET value = ?1",
            params![url],
        )?;
        Ok(())
    }

    /// 清除激活服务器（回到设置页，但保留服务器列表）。
    pub fn clear_active(&self) -> rusqlite::Result<()> {
        self.conn
            .execute("DELETE FROM app_state WHERE key = 'active_server'", [])?;
        Ok(())
    }

    /// 当前激活服务器地址。
    pub fn active_server(&self) -> rusqlite::Result<Option<String>> {
        self.conn
            .query_row(
                "SELECT value FROM app_state WHERE key = 'active_server'",
                [],
                |r| r.get(0),
            )
            .optional()
    }

    /// 更新/清除某服务器的令牌（`None` 表示退出登录）。
    pub fn set_token(&self, url: &str, token: Option<&str>) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE servers SET token = ?2, updated_at = ?3 WHERE url = ?1",
            params![url, token, now()],
        )?;
        Ok(())
    }

    /// 读取某服务器的令牌。
    pub fn token(&self, url: &str) -> rusqlite::Result<Option<String>> {
        self.conn
            .query_row(
                "SELECT token FROM servers WHERE url = ?1",
                params![url],
                |r| r.get::<_, Option<String>>(0),
            )
            .optional()
            .map(|o| o.flatten())
    }
}
