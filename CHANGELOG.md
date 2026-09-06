# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，版本号采用日期式（YYYY.0.0）。

## [2026.0.0] - 2026-09-06

InfoSphere 全新版本：后端从 Node.js/Express/EJS/MySQL 重构为 **Go + Next.js** 双服务架构，附带桌面与 Android 客户端。与旧版不共享运行时，可通过 `migrate-legacy` 命令迁移历史数据。

### 架构

- **服务端**：Go + Gin + GORM，REST API（`/api/v1/*`），JWT 认证 + bcrypt 密码散列，单文件二进制部署，在线升级（`system:upgrade`）。
- **多数据库**：SQLite（默认零配置）/ MySQL / PostgreSQL，安装向导选择，GORM 幂等迁移。
- **前端**：Next.js 14 + TypeScript + Tailwind，SSR standalone 部署；SEO 一等公民——公开页服务端渲染，动态 title/description/Open Graph/canonical/JSON-LD（WebSite/Book/Chapter/ProfilePage），动态 `sitemap.xml` 与 `robots.txt`。
- **安装门禁**：未安装时 API 全部 503、页面强制 307 到 `/install`、SSR 再校验三层强制；本地 `data/config.json` 标记。
- **CI/CD**：GitHub Actions 质量门禁（go vet/test、tsc/vitest/next lint/build）→ dev 分支自动部署（原子切换 + 健康检查）→ tag 自动发布多架构 Release。

### 功能

- **内容**：书籍/章节树（多级、排序规则、章节前缀）、标签 many2many 与热门检索、草稿/发布/归档、评论（多级+权限）、点赞与收藏、阅读进度。
- **全文搜索**：书籍标题/简介 + 章节标题/正文聚合检索（`search:read`），登录可见私有内容。
- **第三方登录**：GitHub OAuth（授权码流程、已验证邮箱自动关联、自动注册），凭据管理端配置。
- **站内通知**：评论/回复、点赞/收藏、协作邀请、升级完成触发；SSE 实时推送 + 导航铃铛。
- **协作**：书籍协作者 editor/viewer 角色，编辑权扩展与私有书共享，邀请通知。
- **邮件**：SMTP/日志双驱动，找回密码一次性令牌（60 分钟、SHA-256 哈希、幂等申请）。
- **导入导出**：书籍打包为 markdown zip（front-matter + 章节 + 图片）再导入还原，round-trip 无损验收。
- **存储驱动**：上传支持本地磁盘与七牛云对象存储，管理端切换，七牛令牌自实现零依赖。

### 客户端

- **桌面（Tauri 2）**：macOS/Windows/Linux，服务器地址引导、连接探测回退、系统托盘、窗口状态记忆。
- **Android（Kotlin + Compose）**：服务器配置、登录、书籍搜索、通知、书籍详情、Markdown 原生渲染、章节离线缓存。

### 数据迁移

```bash
go run ./cmd/migrate-legacy -legacy-dsn "user:pass@tcp(127.0.0.1:3306)/infosphere" [-dry-run]
```

旧版 Node/MySQL 的用户（bcrypt 密码平移，原密码可直接登录）、书籍、章节树、第三方绑定、站点配置一次性迁入；唯一键冲突自动跳过，幂等可重跑。详见 [docs/migrate-legacy.md](docs/migrate-legacy.md)。

### Markdown 扩展

完整兼容旧版语法：`:::tabs` / `:::grid` / `:::diff` / `:::katex` / `:::mermaid` / `[toc]` / `!btn` / `!tip` / `!switch` / `:icon:` / 图片尺寸对齐 / 对齐表格 / GitHub issue 引用 / `:::api`。由 vitest 17 项断言守护（含 XSS 净化回归）。

### 权限模型

所有端点声明 `resource:action` 语义权限（`book:create`、`user:read`、`notification:read` 等），角色映射 admin/user，归属校验在 handler 内完成。完整清单见 [docs/api.md](docs/api.md)。
