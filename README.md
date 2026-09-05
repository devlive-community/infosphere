<div align="center">

# InfoSphere 2026

**Go + Next.js + 多数据库** 的开源知识管理系统。一个二进制文件即可部署，附带桌面端与 Android 客户端。

![version](https://img.shields.io/badge/version-2026.0.0-blue)

</div>

---

## 架构

```
infosphere/
├── server/               # Go 服务端（单文件二进制，内嵌前端产物）
│   ├── main.go
│   └── internal/
│       ├── app/          # HTTP 路由、处理器、前端静态资源 embed
│       ├── auth/         # JWT 签发与校验
│       ├── config/       # 安装配置持久化（data/config.json）
│       ├── database/     # SQLite / MySQL / PostgreSQL 多数据库支持
│       └── models/       # GORM 模型与自动迁移
├── app/
│   ├── web/              # Next.js 14 + TypeScript + Tailwind 前端（SSR 服务端渲染）
│   ├── desktop/          # Tauri 2 桌面客户端（macOS / Windows / Linux）
│   └── android/          # Android 客户端（Kotlin + Jetpack Compose）
├── deploy/               # systemd unit / nginx 配置 / sudoers
└── Makefile
```

- **服务端**：Gin + GORM，REST API（`/api/v1/*`），JWT 认证，bcrypt 密码散列，健康检查与在线升级。
- **多数据库**：SQLite（默认，零配置）/ MySQL / PostgreSQL，安装时选择，GORM 自动迁移建表。
- **前端与 SEO**：公开页面（首页/发现/书籍/章节/用户主页）全部 Next.js **服务端渲染**，输出真实 HTML 内容 + 动态 `<title>` / `description` / Open Graph / canonical / JSON-LD（WebSite、Book、Chapter、BreadcrumbList、ProfilePage）+ 动态 `sitemap.xml` 与 `robots.txt`；交互页（编辑器、后台）自动 noindex。
- **CI/CD**：GitHub Actions 质量门禁（go vet/test、tsc/next lint/build）→ dev 分支自动部署生产 → tag 自动发布 Release。
- **客户端**：桌面端与 Android 端连接自托管服务器，数据完全掌握在自己手里。

## 快速开始

### 构建

```bash
make build          # bin/infosphere-server + bin/infosphere-web.tar.gz
make test           # 与 CI 相同的质量门禁（vet/test/tsc/lint）
```

### 生产部署（CI 自动化）

`push` 到 `dev` 分支即触发 [deploy.yml](.github/workflows/deploy.yml)：
前端 SSR + Go API 构建后经 scp 上传服务器，原子切换 `releases/<sha>` 并重启 systemd 服务，健康检查通过后清理旧版本。

服务器架构（见 [deploy/](deploy/)）：

```
nginx (:80/:443)
 ├─ /api /uploads /health  → infosphere-api  (Go,    127.0.0.1:6969)
 └─ /*                     → infosphere-web  (Next.js SSR, 127.0.0.1:6900)
```

首次部署后访问 `/install` 完成安装向导（数据库选择 → 站点信息 → 管理员账户）。

### 发布新版本

```bash
git tag v2026.0.1 && git push origin v2026.0.1
```

[release.yml](.github/workflows/release.yml) 自动构建多架构二进制与前端包并发布 GitHub Release。
线上管理员在「系统管理」页可一键在线升级（自动下载、校验、替换、重启、回滚备份）。

### 本地开发

```bash
make dev-server     # Go API（:6969，数据写入 server/data）
make dev-web        # Next.js SSR（:3000，直连 :6969）
```

### 桌面客户端

```bash
cd app/desktop
pnpm install
pnpm dev            # 开发模式
pnpm build          # 打包安装程序
```

启动后输入 InfoSphere 服务器地址即可接入，地址会被记住。

### Android 客户端

使用 Android Studio 打开 `app/android/`，或：

```bash
cd app/android && ./gradlew assembleDebug
```

首次启动填写服务器地址，登录后即可浏览与阅读书籍章节。

## API 概览

| 模块 | 端点 |
| --- | --- |
| 安装向导 | `GET /api/v1/setup/status` · `POST /api/v1/setup/test-connection` · `POST /api/v1/setup/install` |
| 认证 | `POST /api/v1/auth/login` · `POST /api/v1/auth/register` · `GET /api/v1/auth/me` · `PUT /api/v1/auth/profile` · `PUT /api/v1/auth/password` |
| 书籍 | `GET/POST /api/v1/books` · `GET/PUT/DELETE /api/v1/books/:id` · `GET /api/v1/books/slug/:slug` |
| 文档 | `GET/POST /api/v1/books/:id/documents` · `GET/PUT/DELETE /api/v1/documents/:id` |
| 探索 | `GET /api/v1/explore/hot` · `GET /api/v1/explore/latest` · `GET /api/v1/stats` |
| 用户 | `GET /api/v1/users/:username` · `GET /api/v1/users/:username/books` |
| 其他 | `GET/PUT /api/v1/site` · `POST /api/v1/upload` |

## 版本历史

- **2026.0.0**：全新架构 —— Go 服务端 + Next.js/TypeScript 前端 + 多数据库（SQLite/MySQL/PostgreSQL）+ 安装向导 + 单文件部署 + 桌面端/Android 客户端。

## 鸣谢

[Jetbrains](https://www.jetbrains.com/) · [Tailwind CSS](https://tailwindcss.com/)
