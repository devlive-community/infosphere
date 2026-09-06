# InfoSphere API 接口契约

> 本文档是全部 REST API 的权威契约，供 Web / 桌面端（Tauri）/ Android 客户端开发使用。
> 任何端点变更必须同步更新本文档。

- Base URL：`{服务器地址}/api/v1`，生产环境同源部署（nginx 分流），无需跨域配置
- 响应格式：统一 JSON 信封 `{ "success": true, "data": ... }` 或 `{ "success": false, "message": "...", "code": "..." }`
- 时间格式：RFC3339（如 `2026-09-05T12:00:00+08:00`）
- 分页参数：`page`（默认 1）、`page_size`（默认 12，最大 100）；分页响应 `{ items, total, page, page_size }`

## 认证

除标注「匿名」的端点外，请求需携带 JWT：

```
Authorization: Bearer <token>
```

- 令牌在登录 / 注册 / 安装完成时签发，有效期 7 天，HS256 签名
- 签发时**同时下发 `infosphere_token` Cookie**（7 天，非 HttpOnly）：Web SSR 凭 Cookie 在服务端渲染登录态；客户端仍用 `Authorization: Bearer` 或同源 Cookie 均可
- 登出时客户端清除 localStorage 并使 Cookie 过期（`Max-Age=0`）
- `GET /auth/permissions` 可获取当前用户权限列表，客户端据此控制 UI 可见性

## 权限模型

权限标识格式为 **`功能:权限`**（`resource:action`），定义在 `server/internal/authz/authz.go`。

| 权限 | 说明 | user 角色 | admin 角色 |
| --- | --- | :-: | :-: |
| `book:read` | 浏览书籍列表与详情 | ✅ | ✅ |
| `book:create` | 创建书籍 | ✅ | ✅ |
| `book:update` | 更新书籍（仅本人） | ✅ | ✅ |
| `book:delete` | 删除书籍（仅本人） | ✅ | ✅ |
| `document:read` | 浏览文档树与正文 | ✅ | ✅ |
| `document:create` | 创建文档（仅本人书籍） | ✅ | ✅ |
| `document:update` | 更新文档（仅本人书籍） | ✅ | ✅ |
| `document:delete` | 删除文档（仅本人书籍） | ✅ | ✅ |
| `user:read` | 查看用户公开主页 | ✅ | ✅ |
| `user:update` | 更新个人资料与密码 | ✅ | ✅ |
| `site:read` | 读取站点公开配置 | ✅ | ✅ |
| `tag:read` | 浏览标签与按标签检索 | ✅ | ✅ |
| `tag:create` | 创建标签（书籍打标时自动创建） | ✅ | ✅ |
| `tag:delete` | 删除标签 | ❌ | ✅ |
| `search:read` | 全局搜索书籍与章节（匿名仅公开内容） | ✅ | ✅ |
| `comment:read` | 浏览章节评论（匿名可读） | ✅ | ✅ |
| `comment:create` | 发表评论 | ✅ | ✅ |
| `comment:update` | 编辑自己的评论 | ✅ | ✅ |
| `comment:delete` | 删除评论（本人/书籍作者/管理员） | ✅ | ✅ |
| `reaction:create` | 点赞/收藏书籍 | ✅ | ✅ |
| `reaction:delete` | 取消点赞/收藏 | ✅ | ✅ |
| `reaction:read` | 查看自己的点赞/收藏 | ✅ | ✅ |
| `auth:oauth` | 管理第三方登录绑定 | ✅ | ✅ |
| `auth:password-reset` | 申请/执行密码重置（匿名语义，端点公开） | ✅ | ✅ |
| `notification:read` | 查看自己的通知（含 SSE 流） | ✅ | ✅ |
| `notification:update` | 标记通知已读 | ✅ | ✅ |
| `collaborator:read` | 查看书籍协作者列表 | ✅ | ✅ |
| `collaborator:create` | 添加/更新协作者（仅书籍所有者/管理员） | ✅ | ✅ |
| `collaborator:delete` | 移除协作者（所有者；协作者可自行退出） | ✅ | ✅ |
| `book:export` | 导出书籍为 markdown zip（owner/admin/editor 协作者） | ✅ | ✅ |
| `book:import` | 从 zip 导入书籍（成为导入者的个人书籍） | ✅ | ✅ |
| `site:update` | 更新站点配置 | ❌ | ✅ |
| `stats:read` | 读取站点统计 | ✅ | ✅ |
| `upload:create` | 上传图片 | ✅ | ✅ |
| `system:read` | 查看系统版本信息 | ❌ | ✅ |
| `system:upgrade` | 触发在线升级 | ❌ | ✅ |

补充规则：

- 标注「匿名」的端点无需令牌即可访问（公开内容）；携带令牌可看到自己可见的私有内容
- 归属校验在服务端 handler 内完成：拥有 `book:update` 只能改自己的书，admin 可改所有
- 权限不足返回 `403 { code: "PERMISSION_DENIED", message: "权限不足，需要 xxx" }`

## 全局错误

| HTTP | 场景 |
| --- | --- |
| 400 | 参数错误 |
| 401 | 未登录 / 令牌无效 |
| 403 | 权限不足 / 无权访问该资源 |
| 404 | 资源不存在 |
| 503 | `{ code: "NOT_INSTALLED" }` 系统尚未安装（仅安装向导与健康检查可用） |

---

## 基础

| 方法 | 路径 | 说明 | 认证 |
| --- | --- | --- | --- |
| GET | `/health` | 健康检查（nginx/CI 用），返回 db/版本/commit | 匿名 |

`GET /api/v1/health` →
```json
{ "status": "ok", "db": "up", "installed": true, "version": "2026.0.0", "commit": "6eceb7d", "build_date": "..." }
```

## 安装向导（仅未安装时可用）

| 方法 | 路径 | 说明 | 认证 |
| --- | --- | --- | --- |
| GET | `/setup/status` | 安装状态、版本、可选数据库类型、默认数据目录与 SQLite 路径 | 匿名 |
| POST | `/setup/test-connection` | 测试数据库连接 | 匿名 |
| POST | `/setup/install` | 执行安装（迁移建表 + 站点配置 + 管理员），成功即登录 | 匿名 |

`POST /setup/install` 请求体：
```json
{
  "database": { "type": "sqlite", "path": "" },
  "site": { "name": "我的知识库", "description": "一句话介绍" },
  "admin": { "username": "admin", "email": "a@b.c", "password": "至少6位" }
}
```
`database.type` ∈ `sqlite | mysql | postgres`；sqlite 留空 `path` 使用默认；mysql/postgres 需 `host/port/name/user/password`。

## 认证与会话

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| POST | `/auth/register` | 注册，返回 token + user | 匿名 |
| POST | `/auth/login` | 登录（用户名或邮箱），返回 token + user | 匿名 |
| GET | `/auth/me` | 当前用户信息 | 登录 |
| GET | `/auth/permissions` | 当前用户权限列表（`string[]`） | 登录 |
| PUT | `/auth/profile` | 更新资料（email/avatar/bio/github_url） | `user:update` |
| PUT | `/auth/password` | 修改密码（old_password/new_password；OAuth 用户未设密码时免验原密码，用于首次设置） | `user:update` |
| POST | `/auth/password/forgot` | 匿名申请找回：`{email}`；响应不泄露邮箱是否存在，令牌邮件 60 分钟有效、一次性、只保留最新一条；`mail_driver=log` 时链接输出到后端日志 | `auth:password-reset`（匿名语义） |
| POST | `/auth/password/reset` | 匿名重置：`{token, password}`（≥6 位）；成功后旧密码立即失效，该用户其余令牌作废 | `auth:password-reset`（匿名语义） |

## 第三方登录（OAuth，当前支持 github）

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | `/auth/oauth/providers` | 各 provider 启用状态：`{providers:[{provider,enabled}]}` | 匿名 |
| GET | `/auth/oauth/:provider?origin=` | 发起登录：302 到授权页；未配置/不支持时 302 回 `{origin}/login?oauth_error=...` | 匿名 |
| GET | `/auth/oauth/:provider/callback` | 授权回调：换取用户 → 已绑定直接登录 / 已验证邮箱自动关联 / 自动注册；签发 token + Cookie 后 302 回 `{origin}/oauth/callback?token=...` | 匿名 |
| GET | `/auth/oauth/bindings` | 当前用户绑定列表 `[{provider,provider_username,provider_email,created_at}]` | 登录 |
| DELETE | `/auth/oauth/:provider` | 解绑；未设置本地密码时拒绝（防止锁死） | `auth:oauth` |
| GET/PUT | `/oauth` | 管理员读取/保存 GitHub 凭据（client_id/client_secret/enabled），存站点配置表，不出现在公开 `/site` | `site:update` |
| GET/PUT | `/mail` | 管理员读取/保存邮件配置（driver log\|smtp、host/port/username/password/from）与 `site_url`（找回邮件链接前缀） | `site:update` |
| GET/PUT | `/storage` | 管理员读取/保存存储驱动配置：`driver` local\|qiniu + 七牛凭据（access_key/secret_key/bucket/domain/upload_host，域名须含协议） | `site:update` |

> 凭据存于站点配置（`oauth_github_*` 键）；state 防 CSRF 为内存态（10 分钟 TTL），适配当前单实例部署架构。

## 站点与统计（公开）

| 方法 | 路径 | 说明 | 语义权限 |
| --- | --- | --- | --- |
| GET | `/site` | 站点公开配置（site_name/site_description/version） | `site:read` |
| PUT | `/site` | 更新站点配置 | `site:update` |
| GET | `/stats` | 站点统计（user_count/book_count/document_count/total_views） | `stats:read` |

## 发现（公开）

| 方法 | 路径 | 说明 | 语义权限 |
| --- | --- | --- | --- |
| GET | `/explore/hot` | 浏览量最高的 6 本公开书籍 | `book:read` |
| GET | `/explore/latest` | 最新发布的 6 本公开书籍 | `book:read` |
| GET | `/search?q=` | 全局搜索：命中标题/简介的书籍 + 命中标题/正文的章节（各取前 10 条，含 `book_slug`/`doc_slug` 便于跳转）；登录时可见范围含本人私有书籍 | `search:read` |

## 用户（公开主页）

| 方法 | 路径 | 说明 | 语义权限 |
| --- | --- | --- | --- |
| GET | `/users/:username` | 用户公开资料与公开书籍数 | `user:read` |
| GET | `/users/:username/books?page=` | 该用户的公开书籍（分页） | `user:read` |

## 书籍

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | `/books?page&page_size&title&status&mine` | 列表；默认公开书籍，`mine=true` 查自己的（需登录） | `book:read` |
| POST | `/books` | 创建书籍 | `book:create` |
| GET | `/books/:id` | 书籍详情（含作者） | `book:read` |
| GET | `/books/slug/:slug` | 按 slug 查书籍 | `book:read` |
| PUT | `/books/:id` | 更新书籍（标题/简介/封面/状态/公开性/排序规则/章节前缀） | `book:update` |
| DELETE | `/books/:id` | 删除书籍及其全部文档 | `book:delete` |
| GET | `/books/summary` | 当前用户书籍统计（按状态汇总） | `book:read` |
| POST | `/books/:id/view` | 浏览计数 +1 | `book:read` |

书籍字段：`id, title, description, cover_image, slug, status(draft|published|archived), is_public, view_count, order_col(created_at|updated_at|title|view_count), order_dir(asc|desc), chapter_prefix, user, tags, created_at, updated_at`

## 文档（章节，支持树形）

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | `/books/:id/documents` | 文档树（不含正文），节点含 `children` | `document:read` |
| POST | `/books/:id/documents` | 创建文档（title 必填；slug 留空自动生成；parent_id 归属校验） | `document:create` |
| GET | `/books/:id/documents/slug/:slug` | 按 slug 查文档（含正文） | `document:read` |
| GET | `/documents/:id` | 文档详情（含正文） | `document:read` |
| PUT | `/documents/:id` | 更新（title/content/parent_id/sort_order/status/slug；防环校验） | `document:update` |
| DELETE | `/documents/:id` | 删除文档及其子树 | `document:delete` |

文档字段：`id, book_id, parent_id, title, slug, content( markdown), user_id, sort_order, status, allow_comments(公开后允许评论，默认 true), created_at, updated_at, children`；创建/更新请求体同样接受 `allow_comments`

> **协作（M14）**：书籍协作者（editor）拥有章节内容的增删改权限，与所有者相同；书籍设置与删除仍限所有者/管理员。viewer 可访问私有协作书籍及其已发布章节。协作者查看章节/文档端点直接复用上表权限。

## 协作者（M14）

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | `/books/:id/collaborators` | 协作者列表（含 user 摘要）；所有者/管理员/协作者可查 | `collaborator:read` |
| POST | `/books/:id/collaborators` | 添加或更新协作者 `{username, role: editor\|viewer}`；已存在则覆盖角色；向对方发送协作邀请通知 | `collaborator:create` |
| DELETE | `/books/:id/collaborators/:userId` | 移除协作者；协作者可传自己的 userId 退出协作 | `collaborator:delete` |

## 标签

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | `/tags?q=&limit=` | 标签列表（含公开书籍使用计数 `book_count`，按计数降序） | `tag:read` |
| POST | `/tags` | 创建标签 `{ "name": "Go" }` | `tag:create` |
| DELETE | `/tags/:id` | 删除标签并解绑全部书籍 | `tag:delete` |
| GET | `/tags/:slug/books?page=` | 按标签查公开书籍（分页） | `tag:read` |

- 书籍对象包含 `tags: [{ id, name, slug }]`；创建/更新书籍时请求体可传 `tags: ["Go", "后端"]`，服务端自动 find-or-create 并全量替换关联（单书最多 10 个）
- 列表过滤：`GET /books?tag=<slug>`

## 上传

- `POST /upload`（multipart `file`，≤10MB，png/jpg/jpeg/gif/webp/svg/ico）：按存储配置写入 **local**（默认，返回 `/uploads/<name>` 相对地址，由 `/uploads/*` 静态服务）或 **qiniu**（表单上传，返回 `<CDN 域名>/<key>` 绝对地址）；凭据存站点配置表（`storage_driver`、`qiniu_*`），管理端经 `/storage` 维护

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| POST | `/upload` | `multipart/form-data` 字段 `file`，仅图片（png/jpg/jpeg/gif/webp/svg/ico），≤10MB；返回 `{ url }`（如 `/uploads/xxx.png`） | `upload:create` |

## 点赞 / 收藏（登录用户）

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| POST | `/books/:id/reactions` | 点赞或收藏，请求体 `{ "type": "like" \| "favorite" }`，重复请求幂等 | `reaction:create` |
| DELETE | `/books/:id/reactions?type=` | 取消（like / favorite） | `reaction:delete` |
| GET | `/books/:id/reactions/me` | 当前用户对该书的态度 + 全站计数 | `reaction:read` |
| GET | `/users/me/reactions?type=&page=` | 我的点赞/收藏列表（含书籍对象，分页） | `reaction:read` |

## 站内通知（登录用户）

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | `/notifications?page=&per_page=&unread=true` | 当前用户通知（ newest 在前）+ `unread_count` | `notification:read` |
| POST | `/notifications/read` | 标记已读：`{ids:[]}` 或 `{all:true}`，返回最新 `unread_count` | `notification:update` |
| GET | `/notifications/stream` | SSE 实时流：连接即推 `{"unread_count":n}`，新通知实时推送；25s 心跳。**鉴权支持 `?token=`**（EventSource 无法带 Authorization 头） | `notification:read` |

- 通知类型：`comment`（评论/回复）、`reaction`（点赞/收藏）、`system`（升级完成等）
- `payload` 为 JSON 对象，含 `link`（点击跳转地址）等扩展字段
- 触发规则：他人评论你的章节/回复你的评论、他人点赞/收藏你的书（重复操作不重复通知）、服务启动检测到版本变化时通知管理员

## 导入导出（M16）

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | `/books/:id/export?format=markdown` | 导出书籍为 zip：`book.md`（front-matter：标题/简介/slug/状态/公开/排序/章节前缀/封面/标签）+ `chapters/<序号>-<slug>.md`（front-matter：标题/slug/排序/状态/父章节/评论开关 + 正文）+ `images/`（本站 `/uploads` 图片随包携带并改写为相对引用，外链保持原样） | `book:export` |
| POST | `/import` | multipart 上传 `file`（zip），解析同一结构还原为新书：元数据/标签/章节树（按 parent slug 重建）/图片写回上传目录；slug 冲突自动追加 `-imported-N`；安全限制：≤500 文件、解压总量 ≤64MB、拒绝 `..` 路径 | `book:import` |

> 验收标准：导出再导入内容无损（含嵌套章节、草稿状态、评论开关、标签、封面与正文图片）。

## 阅读进度（登录用户）

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | `/reading-progress/:bookId` | 当前用户在该书籍的最近阅读章节；无进度返回 `null` | `user:read` |
| PUT | `/reading-progress/:bookId` | 记录/覆盖进度，请求体 `{ doc_id, doc_slug, doc_title }` | `user:read` |

响应为进度对象 `{ id, user_id, book_id, doc_id, doc_slug, doc_title, updated_at }`，每用户每书一条（upsert）。

## 系统管理（仅管理员）

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | `/system/version` | 当前版本/commit + 上游最新版本 + 是否可升级 | `system:read` |
| POST | `/system/upgrade` | 在线升级（下载 Release 资产 → 校验替换 → 重启服务） | `system:upgrade` |

---

## 客户端接入建议

1. **首次使用**：`GET /setup/status` 判断 `installed`；未安装时引导到安装流程（Web 端由服务端 307 到 `/install`）。
2. **会话管理**：登录后保存 `token` 与 `user`；启动时 `GET /auth/me` 校验令牌，401 时清除本地会话。
3. **权限驱动 UI**：`GET /auth/permissions` 的结果缓存于内存，用 `permissions.includes("book:create")` 之类判断是否渲染入口。
4. **浏览计数**：进入书籍/阅读页时 `POST /books/:id/view`，无需等待结果。
5. **Markdown 渲染**：`content` 为 Markdown 原文，客户端自行渲染（Web 端用 marked + highlight.js + DOMPurify）；请过滤 HTML 防 XSS。
