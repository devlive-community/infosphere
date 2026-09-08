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
| `document-revision:read` | 查看章节版本历史（所有者/admin/editor） | ✅ | ✅ |
| `document-revision:restore` | 恢复章节历史版本（所有者/admin/editor） | ✅ | ✅ |
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
| `auth:oauth` | 管理第三方登录绑定 | ✅ | ✅ |
| `auth:password-reset` | 申请/执行密码重置（匿名语义，端点公开） | ✅ | ✅ |
| `notification:read` | 查看自己的通知（含 SSE 流） | ✅ | ✅ |
| `notification:update` | 标记通知已读 | ✅ | ✅ |
| `collaborator:read` | 查看书籍协作者列表 | ✅ | ✅ |
| `collaborator:create` | 添加/更新协作者（仅书籍所有者/管理员） | ✅ | ✅ |
| `collaborator:delete` | 移除协作者（所有者；协作者可自行退出） | ✅ | ✅ |
| `book:export` | 导出书籍为 markdown zip（owner/admin/editor 协作者） | ✅ | ✅ |
| `book:import` | 从 zip、PDF 或网页导入书籍（成为导入者的私有草稿） | ✅ | ✅ |
| `site:update` | 更新站点配置 | ❌ | ✅ |
| `config:manage` | 管理任意系统配置键值对 | ❌ | ✅ |
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
| PUT | `/auth/password` | 修改密码（old_password/new_password；OAuth 用户未设密码时免验原密码，用于首次设置） | `user:update` |
| POST | `/auth/password/forgot` | 匿名申请找回：`{email}`；响应不泄露邮箱是否存在，令牌邮件 60 分钟有效、一次性、只保留最新一条；`mail_driver=log` 时链接输出到后端日志 | `auth:password-reset`（匿名语义） |
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
| GET | `/stats` | 公开站点统计；书籍、章节、标签和浏览量仅统计公开且已发布内容 | `stats:read` |

## 发现（公开）

| 方法 | 路径 | 说明 | 语义权限 |
| --- | --- | --- | --- |
| GET | `/explore/hot` | 浏览量最高的 6 本公开书籍 | `book:read` |
| GET | `/explore/latest` | 最新发布的 6 本公开书籍 | `book:read` |
| GET | `/search?q=` | 全局搜索：匿名仅查公开且已发布的书籍与章节；owner/admin/editor 可搜索草稿，viewer 仅可搜索已发布章节 | `search:read` |

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
| DELETE | `/books/:id` | 删除书籍及其全部文档 | `book:delete` |
| GET | `/books/status-counts` | 当前用户书籍统计（按状态汇总） | `book:read` |
| POST | `/books/:id/view` | 可见书籍浏览计数 +1；不可见资源统一返回 404 | `book:read` |

书籍字段：`id, title, description, cover_image, slug, status(draft|published|archived), is_public, view_count, order_col(created_at|updated_at|title|view_count), order_dir(asc|desc), chapter_prefix, watermark_enabled, watermark_text, user, tags, created_at, updated_at`

- 阅读水印默认关闭。创建或更新书籍时传 `watermark_enabled: true` 与自定义 `watermark_text`（去除首尾空白后最多 80 个字符）；开启时水印内容不能为空。关闭水印不会清除已经保存的自定义内容。

## 文档（章节，支持树形）

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | `/books/:id/documents` | 可见书籍的文档树（不含正文）；未授权统一 404，普通读者/viewer 仅含已发布章节 | `document:read` |
| POST | `/books/:id/documents` | 创建文档（title 必填；slug 留空自动生成；parent_id 归属校验；成功后生成初始版本） | `document:create` |
| GET | `/books/:id/documents/slug/:slug` | 按 slug 查文档（含正文） | `document:read` |
| GET | `/documents/:id` | 文档详情（含正文） | `document:read` |
| PUT | `/documents/:id` | 更新（title/content/parent_id/sort_order/status/slug；防环校验）；手动保存传 `create_revision: true` 与 `revision_reason: save|publish` 生成不可变版本 | `document:update` |
| DELETE | `/documents/:id` | 删除文档及其子树 | `document:delete` |
| POST | `/documents/:id/view` | 章节浏览计数 +1，并同步累加所属书籍的 `view_count`（书籍总浏览=各章节浏览之和）；不可见返回 404 | `document:read` |
| GET | `/documents/:id/revisions` | 章节版本列表（分页，不含正文）；未授权统一 404 | `document-revision:read` |
| GET | `/documents/:id/revisions/:revisionId` | 版本详情（含正文）；未授权或版本不属于章节时统一 404 | `document-revision:read` |
| POST | `/documents/:id/revisions/:revisionId/restore` | 恢复标题、正文、发布状态与评论设置；自动保留恢复前及恢复后快照 | `document-revision:restore` |

文档字段：`id, book_id, parent_id, title, slug, content( markdown), user_id, sort_order, view_count, status, allow_comments(公开后允许评论，默认 true), created_at, updated_at, children`；创建/更新请求体同样接受 `allow_comments`

版本列表字段：`id, document_id, book_id, title, content_length, status, allow_comments, reason(create|save|publish|pre_restore|restore), author(仅公开字段), created_at`；详情额外返回 `content`。版本记录只新增、不提供修改接口，目录排序等结构调整不会生成版本。

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

- 通知类型：`comment`（评论/回复）、`reaction`（点赞/收藏）、`system`（升级完成等）
- `payload` 为 JSON 对象，含 `link`（点击跳转地址）等扩展字段
- 触发规则：他人评论你的章节/回复你的评论、他人点赞/收藏你的书（重复操作不重复通知）、服务启动检测到版本变化时通知管理员

## 导入导出（M16 / M46）

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | `/books/:id/export?format=markdown` | 导出书籍为 zip：`book.md`（front-matter：标题/简介/slug/状态/公开/排序/章节前缀/封面/标签）+ `chapters/<序号>-<slug>.md`（front-matter：标题/slug/排序/状态/父章节/评论开关 + 正文）+ `images/`（本站 `/uploads` 图片随包携带并改写为相对引用，外链保持原样） | `book:export` |
| POST | `/import` | multipart 上传 `file`（zip），可选 `title`；解析同一结构还原为新书：元数据/标签/章节树（按 parent slug 重建）/图片写回上传目录；slug 冲突自动追加 `-imported-N`；安全限制：≤500 文件、解压总量 ≤64MB、拒绝 `..` 路径 | `book:import` |
| POST | `/import/pdf` | multipart 上传 `file`（PDF，≤64MB），可选 `title`；根据文本坐标、字号和字体样式重建 Markdown 标题、段落、列表及代码块，移除重复页眉页脚，并修正双栏阅读顺序；优先按一、二级 Markdown 标题或“第 N 章/篇/部/卷”、`Chapter N` 拆章，无明确结构时按长度分段；扫描版 PDF 需预先 OCR；结果固定为私有草稿 | `book:import` |
| POST | `/import/web` | JSON `{url,title?,render_mode?}`，`render_mode` 为 `auto`（默认）、`static` 或 `browser`；自动模式先静态抓取，检测到 SPA 空壳或正文不足时使用 Chromium 执行 JavaScript；正文转为 Markdown 并将相对链接补全；结果固定为私有草稿 | `book:import` |
| POST | `/books/:id/documents/import-web` | JSON `{url,title?,render_mode?,parent_id?,sort_order?}`；复用网页正文提取与 SPA 渲染，剔除页头、页脚、导航、侧栏、广告、分享、评论、相关推荐与弹窗，直接在可编辑书籍内创建草稿章节并记录原始来源 | `document:create` |
| POST | `/books/:id/documents/import-web` | JSON `{url,title?,render_mode?,parent_id?,sort_order?}`；复用网页正文提取与 SPA 渲染，剔除页头、页脚、导航、侧栏、广告、分享、评论、相关推荐与弹窗，直接在可编辑书籍内创建草稿章节并记录原始来源 | `document:create` |

> 安全边界：网页导入只允许 HTTP(S)，拒绝 localhost、内网、回环及链路本地地址；重定向和浏览器发起的子资源请求也执行同一校验。动态网页首次导入若系统没有 Chrome/Chromium，会在数据目录准备 Chromium 运行环境。所有导入章节都会生成 `create` 初始版本。

> ZIP 验收标准：导出再导入内容无损（含嵌套章节、草稿状态、评论开关、标签、封面与正文图片）。

## 阅读进度（登录用户）

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | `/reading-progress/:bookId` | 当前用户在可见书籍中的最近阅读章节；无进度返回 `null` | `reading-progress:read` |
| PUT | `/reading-progress/:bookId` | 记录/覆盖进度；`doc_id` 必须属于该书且当前可读，slug/title 由服务端真实章节覆盖；同时将该章节标记为已读 | `reading-progress:update` |
| GET | `/books/:id/read-chapters` | 当前用户在该书已读的章节 ID 列表 `{doc_ids:[]}`，用于详情页进度标记 | `user:read` |

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
| GET | `/admin/activity` | 控制台首页时间线：`recent_users`（最近 5 位注册）+ `recent_books`（最近 5 本建书，不限可见性，含草稿/私有） | `user:manage` |
| GET | `/admin/stats` | 管理后台完整统计，包含私有与未发布内容 | `stats:read` + 管理员 |
| GET | `/admin/configs` | 列出全部系统配置键值对（key/value/description/reserved/updated_at） | `config:manage` |
| PUT | `/admin/configs` | 新增或更新配置 `{key,value,description}`；key 限字母数字与 `. _ : -`，≤50 字符 | `config:manage` |
| DELETE | `/admin/configs/:key` | 删除配置键；系统关键项（site_name/site_description/version/installation_date）禁止删除 | `config:manage` |

---

## 客户端接入建议

1. **首次使用**：`GET /setup/status` 判断 `installed`；未安装时引导到安装流程（Web 端由服务端 307 到 `/install`）。
2. **会话管理**：登录后保存 `token` 与 `user`；启动时 `GET /auth/me` 校验令牌，401 时清除本地会话。
3. **权限驱动 UI**：`GET /auth/permissions` 的结果缓存于内存，用 `permissions.includes("book:create")` 之类判断是否渲染入口。
4. **浏览计数**：进入书籍/阅读页时 `POST /books/:id/view`，无需等待结果。
5. **Markdown 渲染**：`content` 为 Markdown 原文，客户端自行渲染（Web 端用 marked + highlight.js + DOMPurify）；请过滤 HTML 防 XSS。
