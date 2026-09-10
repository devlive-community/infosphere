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
| `book:delete` | 将书籍移入回收站（仅本人） | ✅ | ✅ |
| `book-analytics:read` | 查看本人书籍的聚合访问分析（管理员可查看全部） | ✅ | ✅ |
| `document:read` | 浏览文档树与正文 | ✅ | ✅ |
| `document:create` | 创建文档（仅本人书籍） | ✅ | ✅ |
| `document:update` | 更新文档（仅本人书籍） | ✅ | ✅ |
| `document:delete` | 将文档子树移入回收站（owner/admin/editor） | ✅ | ✅ |
| `document-revision:read` | 查看章节版本历史（所有者/admin/editor） | ✅ | ✅ |
| `document-revision:restore` | 恢复章节历史版本（所有者/admin/editor） | ✅ | ✅ |
| `trash:read` | 查看回收站（普通用户仅自己的内容，管理员可查看全站） | ✅ | ✅ |
| `trash:restore` | 恢复回收站内容（书籍 owner/admin；章节 owner/admin/editor） | ✅ | ✅ |
| `trash:delete` | 永久删除回收站内容（仅资源 owner/admin） | ✅ | ✅ |
| `user:read` | 查看用户公开主页 | ✅ | ✅ |
| `user:update` | 更新个人资料与密码 | ✅ | ✅ |
| `user:manage` | 管理后台管理用户：列表/角色/启停/删除 | ❌ | ✅ |
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
| `reading-progress:read` | 查看自己的阅读进度 | ✅ | ✅ |
| `reading-progress:update` | 保存自己的阅读进度 | ✅ | ✅ |
| `annotation:read` | 查看自己的阅读标注、笔记和书签 | ✅ | ✅ |
| `annotation:create` | 创建自己的阅读标注、笔记和书签 | ✅ | ✅ |
| `annotation:update` | 更新自己的阅读标注和锚点状态 | ✅ | ✅ |
| `annotation:delete` | 删除自己的阅读标注、笔记和书签 | ✅ | ✅ |
| `report:create` | 举报当前有权查看的书籍、章节或评论 | ✅ | ✅ |
| `report:read` | 查看举报队列、举报人身份和处理记录 | ❌ | ✅ |
| `report:update` | 驳回举报或下架被举报内容 | ❌ | ✅ |
| `auth:oauth` | 管理第三方登录绑定 | ✅ | ✅ |
| `auth:password-reset` | 申请/执行密码重置（匿名语义，端点公开） | ✅ | ✅ |
| `notification:read` | 查看自己的通知（含 SSE 流） | ✅ | ✅ |
| `notification:update` | 标记通知已读 | ✅ | ✅ |
| `collaborator:read` | 查看书籍协作者列表 | ✅ | ✅ |
| `collaborator:create` | 添加/更新协作者（仅书籍所有者/管理员） | ✅ | ✅ |
| `collaborator:update` | 接受或拒绝发给自己的协作邀请 | ✅ | ✅ |
| `collaborator:delete` | 移除协作者（所有者；协作者可自行退出） | ✅ | ✅ |
| `book:export` | 导出书籍为 markdown zip（owner/admin/editor 协作者） | ✅ | ✅ |
| `book:import` | 从 zip、PDF 或网页导入书籍（成为导入者的私有草稿） | ✅ | ✅ |
| `site:update` | 更新站点配置 | ❌ | ✅ |
| `config:manage` | 管理任意系统配置键值对 | ❌ | ✅ |
| `audit:read` | 查看管理员高风险操作审计日志 | ❌ | ✅ |
| `task:read` | 查看持久化异步任务状态与失败诊断 | ❌ | ✅ |
| `task:retry` | 将最终失败的异步任务重新排队 | ❌ | ✅ |
| `stats:read` | 读取站点统计 | ✅ | ✅ |
| `upload:create` | 上传图片 | ✅ | ✅ |
| `system:read` | 查看系统版本信息 | ❌ | ✅ |
| `system:upgrade` | 触发在线升级 | ❌ | ✅ |
| `plugin:manage` | 管理后台插件安装/卸载 | ❌ | ✅ |

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
| 429 | `{ code: "RATE_LIMITED", retry_after: 秒数 }` 请求过于频繁；同时返回 `Retry-After`、`X-RateLimit-Limit` 与 `X-RateLimit-Remaining` 响应头 |
| 503 | `{ code: "NOT_INSTALLED" }` 系统尚未安装（仅安装向导与健康检查可用） |

---

## 请求限流

限流状态当前保存在单个服务进程内；键只由策略、用户 ID 或客户端 IP 的摘要组成，不读取或保存密码、令牌、邮箱与请求正文。登录后的写操作优先按用户 ID 隔离，匿名认证操作按客户端 IP 隔离。

| 操作 | 限额 |
| --- | --- |
| 登录 | 每 IP 10 次 / 5 分钟 |
| 注册 | 每 IP 5 次 / 小时 |
| 申请找回密码 | 每 IP 5 次 / 小时 |
| 执行密码重置 | 每 IP 10 次 / 小时 |
| 发布评论 | 每用户 30 次 / 分钟 |
| 点赞、收藏及取消 | 每用户 120 次 / 分钟 |
| 上传图片 | 每用户 20 次 / 分钟 |
| 提交内容举报 | 每用户 20 次 / 小时 |

默认不信任 `X-Forwarded-For` 等代理头。只有反向代理的地址或 CIDR 被显式配置到 `INFO_SPHERE_TRUSTED_PROXIES` 后，服务才使用其传入的客户端 IP；多个值使用英文逗号分隔。

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
| GET | `/setup/status` | 安装状态、版本、可选数据库类型；仅未安装时返回默认数据目录与 SQLite 路径 | 匿名 |
| POST | `/setup/test-connection` | 测试数据库连接；安装完成后返回 404 | 匿名，仅未安装 |
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
| GET/PUT | `/auth/export-settings` | 当前用户 PDF 导出样式偏好：`page_size`(A4\|Letter)、`include_cover`、`include_toc`、`font_size`(12–20)、`code_theme`(light\|dark)、`margin`(narrow\|normal\|wide) | `user:read` / `user:update` |
| PUT | `/auth/password` | 修改密码（old_password/new_password；OAuth 用户未设密码时免验原密码，用于首次设置） | `user:update` |
| POST | `/auth/password/forgot` | 匿名申请找回：`{email}`；响应不泄露邮箱是否存在，令牌邮件 60 分钟有效、一次性、只保留最新一条；邮件写入持久化异步队列，失败自动退避重试；`mail_driver=log` 时执行任务后把链接输出到后端日志 | `auth:password-reset`（匿名语义） |
| POST | `/auth/password/reset` | 匿名重置：`{token, password}`（≥6 位）；成功后旧密码立即失效，该用户其余令牌作废 | `auth:password-reset`（匿名语义） |

## 第三方登录（OAuth，当前支持 github）

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | `/auth/oauth/providers` | 各 provider 启用状态：`{providers:[{provider,enabled}]}` | 匿名 |
| GET | `/auth/oauth/:provider` | 发起登录：302 到授权页；回跳地址固定使用管理员配置的 `site_url`，未配置时使用当前服务地址 | 匿名 |
| GET | `/auth/oauth/:provider/callback` | 授权回调：换取用户 → 已绑定直接登录 / 已验证邮箱自动关联 / 自动注册；签发 token + Cookie 后回到可信站点地址 | 匿名 |
| GET | `/auth/oauth/bindings` | 当前用户绑定列表 `[{provider,provider_username,provider_email,created_at}]` | `auth:oauth` |
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
| GET | `/stats` | 公开站点统计；书籍、章节、标签和浏览量仅统计公开且处于可阅读状态（进行中/已发布/已完成）的内容 | `stats:read` |

## 发现（公开）

| 方法 | 路径 | 说明 | 语义权限 |
| --- | --- | --- | --- |
| GET | `/explore/hot` | 浏览量最高的 6 本公开书籍 | `book:read` |
| GET | `/explore/latest` | 最新发布的 6 本公开书籍 | `book:read` |
| GET | `/search?q=&type=&author=&tag=&updated_from=&updated_to=&page=&page_size=` | 高级全文搜索；`type` 为 all/book/document，作者使用用户名、标签使用 slug、日期为 YYYY-MM-DD。返回书籍/章节分页结果及 `book_total/document_total/total/page/page_size`。匿名仅查公开可读书籍及已发布章节；owner/admin/editor 可搜索草稿，viewer 仅可搜索已发布章节 | `search:read` |

搜索优先使用当前数据库原生全文索引（SQLite FTS5、MySQL FULLTEXT、PostgreSQL tsvector）；数据库能力或建索引权限不足时自动回退 LIKE。全文索引仅负责命中候选，权限过滤始终在查询中独立执行。`type=all` 将两类结果按更新时间合并后分页；`total` 表示当前类型的总数，两个分类总数始终分别返回。

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
| GET | `/books/slug/:slug/access` | 服务端计算当前用户的对象级能力：`can_read/can_manage/can_edit_content/can_export/collaborator_role` | `book:read` + 登录 |
| PUT | `/books/:id` | 更新书籍（标题/简介/封面/状态/公开性/排序规则/章节前缀/阅读水印） | `book:update` |
| DELETE | `/books/:id` | 将书籍及当前章节移入 30 天回收站 | `book:delete` |
| GET | `/books/status-counts?scope=owned\|collaborating` | 当前用户创建或已接受协作书籍的状态统计 | `book:read` |
| POST | `/books/:id/view` | 可见书籍浏览计数 +1，并写入按日、来源聚合桶；可选 JSON `{referrer}`，只保存来源类别，不保存原始网址；不可见资源统一返回 404 | `book:read` |
| GET | `/books/:id/analytics?days=7\|30\|90\|180` | 书籍聚合分析：累计/周期浏览、上一周期增长、每日趋势、热门章节、来源类别、登录读者完成率；仅 owner/admin，日聚合最多保留 180 天 | `book-analytics:read` |

书籍字段：`id, title, description, cover_image, slug, status(draft|in_progress|published|completed|archived), is_public, view_count, order_col(created_at|updated_at|title|view_count), order_dir(asc|desc), chapter_prefix, watermark_enabled, watermark_text, user, tags, created_at, updated_at`

> **书籍状态语义**：`draft` 草稿（不对外阅读）、`in_progress` 进行中、`published` 已发布（兼容既有数据）、`completed` 已完成、`archived` 已归档（从公开区域下线）。当 `is_public=true` 时，`in_progress / published / completed` 均属于可公开阅读状态；章节仍只使用 `draft / published / archived`。

- 阅读水印默认关闭。创建或更新书籍时传 `watermark_enabled: true` 与自定义 `watermark_text`（去除首尾空白后最多 80 个字符）；开启时水印内容不能为空。关闭水印不会清除已经保存的自定义内容。

## 文档（章节，支持树形）

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | `/books/:id/documents` | 可见书籍的文档树（不含正文）；未授权统一 404，普通读者/viewer 仅含已发布章节 | `document:read` |
| POST | `/books/:id/documents` | 创建文档（title 必填；slug 留空自动生成；parent_id 归属校验；成功后生成初始版本） | `document:create` |
| GET | `/books/:id/documents/slug/:slug` | 按 slug 查文档（含正文） | `document:read` |
| GET | `/documents/:id` | 文档详情（含正文） | `document:read` |
| PUT | `/documents/:id` | 更新（title/content/parent_id/sort_order/status/slug；防环校验）；手动保存传 `create_revision: true` 与 `revision_reason: save|publish` 生成不可变版本 | `document:update` |
| DELETE | `/documents/:id` | 将文档及其子树作为同一批次移入 30 天回收站 | `document:delete` |
| POST | `/documents/:id/view` | 章节浏览计数 +1，并同步累加所属书籍的 `view_count` 及按日分析聚合；可选 JSON `{referrer}`；不可见返回 404 | `document:read` |
| GET | `/documents/:id/revisions` | 章节版本列表（分页，不含正文）；未授权统一 404 | `document-revision:read` |
| GET | `/documents/:id/revisions/:revisionId` | 版本详情（含正文）；未授权或版本不属于章节时统一 404 | `document-revision:read` |
| POST | `/documents/:id/revisions/:revisionId/restore` | 恢复标题、正文、发布状态与评论设置；自动保留恢复前及恢复后快照 | `document-revision:restore` |

文档字段：`id, book_id, parent_id, title, slug, content( markdown), user_id, sort_order, view_count, status, allow_comments(公开后允许评论，默认 true), created_at, updated_at, children`；创建/更新请求体同样接受 `allow_comments`

版本列表字段：`id, document_id, book_id, title, content_length, status, allow_comments, reason(create|save|publish|pre_restore|restore), author(仅公开字段), created_at`；详情额外返回 `content`。版本记录只新增、不提供修改接口，目录排序等结构调整不会生成版本。

> **协作（M14/M37）**：邀请初始为 `pending`，受邀用户明确接受成为 `accepted` 后才获得权限。accepted editor 拥有章节内容的增删改权限，书籍设置与删除仍限所有者/管理员；accepted viewer 可访问私有协作书籍及其已发布章节。pending/rejected 不得访问私有书籍，也不得出现在协作书籍、搜索或收藏的私有数据中。

## 回收站（M36）

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | `/trash?type=book\|document&page=&page_size=` | 分页查看回收站；章节只列每个删除批次的根节点并返回子章节数 | `trash:read` |
| POST | `/trash/books/:id/restore` | 恢复书籍及该次随书删除的全部章节 | `trash:restore` + owner/admin |
| DELETE | `/trash/books/:id` | 永久删除书籍、章节、版本、评论、协作、互动和阅读数据 | `trash:delete` + owner/admin |
| POST | `/trash/documents/:id/restore` | 恢复同一删除批次的章节子树并保持父子关系；父章节在其他批次回收站时需先恢复父章节 | `trash:restore` + owner/admin/editor |
| DELETE | `/trash/documents/:id` | 永久删除同一批次的章节子树及其版本、评论和阅读数据 | `trash:delete` + owner/admin |

回收站条目字段：`type, id, title, slug, book_id, book_title, book_slug, owner_username, descendant_count, deleted_at, expires_at`。普通查询、公开页面、搜索、统计和管理列表均默认排除软删除内容。内容保留 30 天；访问回收站时会清理当前可见范围内已过期的条目。未授权读取、恢复或永久删除统一返回 404，避免泄露资源存在性。

## 协作者与邀请（M14/M37）

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | `/books/:id/collaborators` | 协作者列表（含 user 摘要与 pending/accepted/rejected 状态）；所有者/管理员可查全部，已接受协作者只看已加入成员 | `collaborator:read` |
| POST | `/books/:id/collaborators` | 发送邀请 `{username, role: editor\|viewer}`；新邀请为 pending；已接受成员仅覆盖角色 | `collaborator:create` |
| DELETE | `/books/:id/collaborators/:userId` | 移除协作者；协作者可传自己的 userId 退出协作 | `collaborator:delete` |
| GET | `/collaboration/invitations` | 当前用户待确认的协作邀请 | `collaborator:read` |
| POST | `/collaboration/invitations/:id/accept` | 接受自己的待确认邀请，随后协作权限生效 | `collaborator:update` |
| POST | `/collaboration/invitations/:id/reject` | 拒绝自己的待确认邀请，不授予权限 | `collaborator:update` |

“我的书籍”协作视图使用 `GET /books?scope=collaborating`，仅返回当前用户已接受的协作书籍，并在每本书上返回 `collaborator_role`。原有 `mine=true` 与 `scope=owned` 均表示本人创建的书籍。

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

## 评论

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | `/documents/:id/comments` | 可读章节的公开评论列表；用户仅返回公开资料字段 | `comment:read`（匿名语义） |
| POST | `/documents/:id/comments` | 向可读且开启评论的章节发表评论/回复 | `comment:create` |
| PUT | `/comments/:id` | 编辑自己的评论 | `comment:update` |
| DELETE | `/comments/:id` | 评论作者、书籍所有者或管理员删除评论 | `comment:delete` |

## 点赞 / 收藏（登录用户）

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| POST | `/books/:id/reactions` | 对当前可见书籍点赞或收藏，请求体 `{ "type": "like" \| "favorite" }`，重复请求幂等 | `reaction:create` |
| DELETE | `/books/:id/reactions?type=` | 取消（like / favorite） | `reaction:delete` |
| GET | `/books/:id/reactions/me` | 当前用户对该书的态度 + 全站计数 | `reaction:read` |
| GET | `/users/me/reactions?type=&page=` | 我的点赞/收藏列表；自动过滤当前已失去访问权的书籍 | `reaction:read` |

## 站内通知（登录用户）

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | `/notifications?page=&per_page=&unread=true` | 当前用户通知（ newest 在前）+ `unread_count` | `notification:read` |
| POST | `/notifications/read` | 标记已读：`{ids:[]}` 或 `{all:true}`，返回最新 `unread_count` | `notification:update` |
| GET | `/notifications/stream` | SSE 实时流：连接即推 `{"unread_count":n}`，新通知实时推送；25s 心跳。**鉴权支持 `?token=`**（EventSource 无法带 Authorization 头） | `notification:read` |

- 通知类型：`comment`（评论/回复）、`reaction`（点赞/收藏）、`collaboration`（协作邀请）、`moderation`（举报处理结果）、`system`（升级完成等）
- `payload` 为 JSON 对象，含 `link`（点击跳转地址）等扩展字段
- 触发规则：他人评论你的章节/回复你的评论、他人点赞/收藏你的书（重复操作不重复通知）、服务启动检测到版本变化时通知管理员

## 内容举报（登录用户）

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| POST | `/reports` | 举报当前有权查看的内容：`{target_type:"book"\|"document"\|"comment",target_id,reason,description?}`；原因支持 `spam/harassment/copyright/illegal/misleading/other`；同一用户对同一目标只能存在一条待处理举报 | `report:create` |

普通用户只能提交举报，无法读取队列或其他举报人的信息。目标不可见或不存在时统一返回 404；补充说明最多 1000 字。

## 导入导出（M16 / M46）

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | `/books/:id/export?format=markdown` | 导出书籍为 zip：`book.md`（front-matter：标题/简介/slug/状态/公开/排序/章节前缀/封面/标签）+ `chapters/<序号>-<slug>.md`（front-matter：标题/slug/排序/状态/父章节/评论开关 + 正文）+ `images/`（本站 `/uploads` 图片随包携带并改写为相对引用，外链保持原样） | `book:export` |
| GET | `/books/:id/export/pdf?style=author\|mine` | 通过 pdf-export 插件（无头 Chrome）导出 PDF。鉴权：作者/协作者/管理员始终可导；否则要求书籍公开、处于可阅读状态且 `export_enabled`。`style=author`（仅当作者 `export_style_shared`）用作者导出样式，否则用请求者样式；水印始终取自作者设置。未安装插件返回 400 | `book:read`（匿名可导开放的公开书） |
| POST | `/import` | multipart 上传 `file`（ZIP，≤64MB），可选 `title`；源文件以 0600 权限私有保存并返回 `202` 和 `task`，后台还原元数据、标签、章节树和图片；slug 冲突自动追加 `-imported-N`。安全限制：≤500 文件、解压总量 ≤64MB、拒绝绝对路径与 `..` 路径 | `book:import` |
| POST | `/import/pdf` | multipart 上传 `file`（PDF，≤64MB），可选 `title`；文件以 0600 权限私有保存后返回 `202` 和 `task`，后台根据文本坐标、字号和字体样式重建 Markdown 标题、段落、列表及代码块，移除重复页眉页脚并修正双栏阅读顺序；结果固定为私有草稿。扫描版 PDF 需预先 OCR | `book:import` |
| POST | `/books/:id/import/pdf` | multipart 上传 `file`（PDF，≤64MB）及 `mode=append\|replace`，仅书籍 owner/admin 可用；返回 `202` 和 `task` 后后台执行。`append` 将新解析的 Markdown 章节以草稿追加到目录末尾；`replace` 在同一事务内清理旧章节及关联状态后写入新草稿章节，并将书籍转为私有草稿。解析失败不会改动旧数据 | `book:import` |
| GET | `/tasks/:id` | 查询当前用户自己的后台任务状态；成功时返回解密后的 `result`，等待/执行/重试/失败状态返回进度和有限错误信息；无法枚举或读取他人的任务，任务载荷永不返回 | 登录用户 |
| POST | `/import/web` | JSON `{url,title?,render_mode?}`，`render_mode` 为 `auto`（默认）、`static` 或 `browser`；自动模式先静态抓取，检测到 SPA 空壳或正文不足时使用 Chromium 执行 JavaScript；正文转为 Markdown 并将相对链接补全；结果固定为私有草稿 | `book:import` |
| POST | `/books/:id/documents/import-web` | JSON `{url,title?,render_mode?,parent_id?,sort_order?}`；复用网页正文提取与 SPA 渲染，剔除页头、页脚、导航、侧栏、广告、分享、评论、相关推荐与弹窗，直接在可编辑书籍内创建草稿章节并记录原始来源 | `document:create` |

> 安全边界：网页导入只允许 HTTP(S)，拒绝 localhost、内网、回环及链路本地地址；重定向和浏览器发起的子资源请求也执行同一校验。动态网页首次导入若系统没有 Chrome/Chromium，会在数据目录准备 Chromium 运行环境。所有导入章节都会生成 `create` 初始版本。PDF/ZIP 后台任务成功后立即删除源文件；最终失败任务保留源文件以供重试，超过 30 天由启动清理回收。

> ZIP 验收标准：导出再导入内容无损（含嵌套章节、草稿状态、评论开关、标签、封面与正文图片）。

## 阅读进度（登录用户）

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | `/reading-progress/:bookId` | 当前用户在可见书籍中的最近阅读章节；无进度返回 `null` | `reading-progress:read` |
| PUT | `/reading-progress/:bookId` | 记录/覆盖进度；`doc_id` 必须属于该书且当前可读，slug/title 由服务端真实章节覆盖；同时将该章节标记为已读 | `reading-progress:update` |
| GET | `/books/:id/read-chapters` | 当前用户在该书已读的章节 ID 列表 `{doc_ids:[]}`，用于详情页进度标记 | `user:read` |

## 阅读标注与私人笔记（登录用户）

所有数据始终按当前用户隔离。管理员也不能读取或修改其他用户的私人笔记。章节后来变为不可见时，章节标注接口统一返回 404，“我的笔记”聚合列表不再返回该资源；用户仍可凭自己的标注 ID 删除私人数据。

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | `/documents/:id/annotations` | 当前用户在可见章节中的划线、私人笔记和章节书签 | `annotation:read` |
| POST | `/documents/:id/annotations` | 创建 `highlight\|note\|bookmark`；划线/笔记需提交 `quote/prefix/suffix/start_offset/end_offset`，同章书签重复创建时覆盖 | `annotation:create` |
| PUT | `/annotations/:id` | 更新自己的笔记、颜色、位置与 `active\|relocated\|orphaned` 锚点状态 | `annotation:update` |
| DELETE | `/annotations/:id` | 删除自己的私人标注；越权统一返回 404 | `annotation:delete` |
| GET | `/users/me/annotations` | 分页聚合仍有权访问的私人标注；支持 `kind=highlight\|note\|bookmark` | `annotation:read` |

锚点以正文文本位置和 `quote + prefix + suffix` 文本片段共同保存。客户端优先校验原位置，章节更新后使用上下文重新定位；无法定位时保留 `quote` 原文快照并标记为 `orphaned`。

响应为进度对象 `{ id, user_id, book_id, doc_id, doc_slug, doc_title, updated_at }`，每用户每书一条（upsert）。

## 系统管理（仅管理员）

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | `/system/version` | 当前版本/commit + 上游最新版本 + 是否可升级 | `system:read` |
| POST | `/system/upgrade` | 在线升级（下载 Release 资产 → 校验替换 → 重启服务） | `system:upgrade` |
| GET | `/admin/users?page=&page_size=&q=&role=&status=&sort=` | 分页查询用户（`q` 匹配用户名/邮箱，`role` admin\|user，`status` active\|inactive，`sort` created_at_desc\|created_at_asc\|last_login_at_desc\|last_login_at_asc，默认 created_at_desc） | `user:manage` |
| PUT | `/admin/users/:id/role` | 变更角色 `{role: admin\|user}`；禁止操作自身，保留至少一位启用管理员 | `user:manage` |
| PUT | `/admin/users/:id/status` | 启停账户 `{is_active}`；禁止停用自身，保留至少一位启用管理员 | `user:manage` |
| DELETE | `/admin/users/:id` | 删除用户；禁止删除自身，拥有书籍者需先清理书籍 | `user:manage` |
| GET | `/admin/books?page=&page_size=&q=&status=&visibility=&sort=` | 分页查询全站书籍（含草稿、进行中、已发布、已完成、归档及私有内容）；`q` 匹配标题/slug/作者，支持状态、公开性与创建/更新/浏览量排序 | `book:read` + 管理员 |
| GET | `/admin/documents?page=&page_size=&q=&book_id=&status=&sort=` | 分页查询全站章节元数据（不返回正文）；`q` 匹配章节标题/slug/书名/作者，支持按书籍、状态及创建/更新/浏览量排序 | `document:read` + 管理员 |
| GET | `/admin/activity` | 控制台首页时间线：`recent_users`（最近 5 位注册）+ `recent_books`（最近 5 本建书，不限可见性，含草稿/私有） | `user:manage` |
| GET | `/admin/stats` | 管理后台完整统计，包含私有与未发布内容 | `stats:read` + 管理员 |
| GET | `/admin/audit-logs?page=&page_size=&actor=&action=&resource_type=&from=&to=` | 分页查询管理员高风险操作；支持操作人、动作、资源类型与日期区间筛选，日期格式为 `YYYY-MM-DD` | `audit:read` |
| GET | `/admin/tasks?page=&page_size=&status=&type=` | 分页查询异步任务；状态支持 pending/running/retrying/succeeded/failed，类型包含 `email.send`、`content.import.pdf`、`content.import.zip`、`maintenance.cleanup`，加密任务载荷永不返回 | `task:read` |
| POST | `/admin/tasks/:id/retry` | 将最终失败任务清空旧错误和尝试次数后重新排队；重复操作返回 409 | `task:retry` |
| GET | `/admin/reports?page=&page_size=&status=&target_type=&reason=&q=` | 举报队列与处理记录；`q` 匹配目标摘要、举报人用户名或邮箱；举报人身份仅此管理员接口返回 | `report:read` |
| PUT | `/admin/reports/:id` | 处理待审举报：`{resolution:"reject"\|"takedown",note?}`；下架会将书籍转为私有归档、章节归档或评论隐藏，并通知举报人 | `report:update` |
| GET | `/admin/plugins` | 列出后台插件及安装状态（installed/version/status/error） | `plugin:manage` |
| POST | `/admin/plugins/:key/install` | 后台异步安装插件（pdf-export 下载 chrome-headless-shell 到数据目录），轮询 `/admin/plugins` 看状态 | `plugin:manage` |
| POST | `/admin/plugins/:key/uninstall` | 卸载插件并清理下载文件 | `plugin:manage` |
| GET | `/admin/configs` | 列出全部系统配置键值对（key/value/description/reserved/updated_at） | `config:manage` |
| PUT | `/admin/configs` | 新增或更新配置 `{key,value,description}`；key 限字母数字与 `. _ : -`，≤50 字符 | `config:manage` |
| DELETE | `/admin/configs/:key` | 删除配置键；系统关键项（site_name/site_description/version/installation_date）禁止删除 | `config:manage` |

审计日志响应项包含 `actor_id/actor_username/action/resource_type/resource_id/resource_label/summary/created_at`。`summary` 只保存脱敏变更摘要；密码、令牌、OAuth Secret、存储密钥与通用配置值不进入审计记录。
举报处理统一写入 `report.resolved` 审计动作，摘要只记录目标类型、目标 ID 与处理结果，不复制举报人身份或举报正文。
任务载荷使用应用密钥经 AES-GCM 加密后写入数据库；管理员接口只返回类型、状态、尝试次数、时间和截断后的错误信息。服务启动时会把中断超过 5 分钟的 running 任务恢复为 retrying，成功或最终失败记录保留 30 天。

---

## 客户端接入建议

1. **首次使用**：`GET /setup/status` 判断 `installed`；未安装时引导到安装流程（Web 端由服务端 307 到 `/install`）。
2. **会话管理**：登录后保存 `token` 与 `user`；启动时 `GET /auth/me` 校验令牌，401 时清除本地会话。
3. **权限驱动 UI**：`GET /auth/permissions` 的结果缓存于内存，用 `permissions.includes("book:create")` 之类判断是否渲染入口。
4. **浏览计数**：进入书籍/阅读页时 `POST /books/:id/view`，无需等待结果。
5. **Markdown 渲染**：`content` 为 Markdown 原文，客户端自行渲染（Web 端用 marked + highlight.js + DOMPurify）；请过滤 HTML 防 XSS。
