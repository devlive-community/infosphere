# 旧版数据迁移指南（Node.js/MySQL → Go 新版）

`migrate-legacy` 命令把旧版 InfoSphere（Node.js 后端 + MySQL）的数据一次性迁移到新版（Go API，支持 SQLite/MySQL/PostgreSQL 目标）。

## 迁移范围

| 旧表 | 新表 | 说明 |
| --- | --- | --- |
| `users` | `users` | **bcrypt 密码哈希原样平移，迁移后用户可用原密码直接登录**；用户名/邮箱已存在的自动跳过 |
| `books` | `books` | 标题/简介/封面/slug/状态/可见性/浏览量 + 排序规则（order_col/order_dir）与章节前缀 |
| `documents` | `documents` | 正文/排序/状态/父子层级（parent_id 自动重映射到新 ID） |
| `user_authentications` | `user_authentications` | GitHub 等第三方登录绑定，按 (provider, provider_id) 去重 |
| `site_configs` | `site_configs` | 自定义配置键；`version` 等保留键与目标已有键不覆盖 |

标签、评论、点赞/收藏、阅读进度、通知是新版功能，无旧数据需要迁移。

## 使用步骤

1. **部署新版**并完成安装向导（目标库此时已有自己的管理员账户）。
2. 停止旧版服务（或确认旧库不再写入），准备旧库连接串。
3. 执行迁移（在 `server/` 目录下）：

   ```bash
   # 先 dry-run 核对数量，不写入
   go run ./cmd/migrate-legacy \
     -legacy-dsn "user:pass@tcp(127.0.0.1:3306)/infosphere" -dry-run

   # 正式迁移
   go run ./cmd/migrate-legacy \
     -legacy-dsn "user:pass@tcp(127.0.0.1:3306)/infosphere"
   ```

   也可用环境变量 `LEGACY_MYSQL_DSN` 传递连接串。目标库通过常规 `INFO_SPHERE_*` 配置定位（与主服务一致）。

4. 观察输出的统计（各实体「新迁入 / 跳过」数量）。**命令可重复执行**：已存在的记录自动跳过，适合分批核对。

## 注意事项

- 目标库必须已完成新版安装（未安装时命令会拒绝执行）。
- 旧库若与新库同库（同 MySQL 实例不同表前缀）不受影响：迁移按表名读取旧表、写入新表。
- 旧库用户与新目标用户冲突时（如都叫 `admin`）会跳过该用户，其书籍/章节的作者归属会挂到目标同名账户下。
- 迁移前建议备份目标库（SQLite 即复制 data 目录下的 `infosphere.db`）。
