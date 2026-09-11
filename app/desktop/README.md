# InfoSphere 桌面客户端

基于 Tauri 2 的跨平台桌面客户端（macOS / Windows / Linux），连接自托管的 InfoSphere 服务器。

## 开发

```bash
pnpm install
pnpm dev        # 需要已运行 InfoSphere 服务端
```

## 打包

```bash
pnpm build      # 产物在 src-tauri/target/release/bundle/
```

## 工作方式

桌面端复用服务端内嵌的 Next.js 界面（webview 直接渲染服务端页面），UI 与服务端版本天然一致；所有业务逻辑与数据都保存在服务器上，桌面端只负责「连接哪台服务器」与「本地保存会话」。

- 首次启动显示本地设置页（`dist/index.html`），输入地址后校验 `/api/v1/setup/status` 可达，再保存并跳转；
- 支持保存多台服务器，设置页可一键切换 / 删除；托盘「切换服务器」回到设置页（保留已存列表）；
- 登录后 web 端写入 localStorage 的令牌，会经注入脚本回写到本地 SQLite；下次启动自动 seed 回 localStorage，保持登录态。

### 本地存储（SQLite）

- 位置：系统应用配置目录下 `infosphere.db`（`rusqlite`，Rust 侧持有）。
  - `servers(url, name, token, updated_at)`：已连接的服务器与其登录令牌；
  - `app_state(active_server)`：当前激活的服务器。
- 旧版 `config.json` 的 `server_url` 会在首次启动时自动迁移进 SQLite，随后删除旧文件。

### 令牌桥与远程 IPC

- Rust 在创建主窗口时注入脚本：同步 seed 令牌 + 包裹 `localStorage` 的 `setItem/removeItem`，令牌变化经 IPC（`bridge_save_token` / `bridge_clear_token`）回写 SQLite，**不改动 `app/web` 代码**。
- 远程页面调用桥命令需 Tauri v2 capability 授权，见 `src-tauri/capabilities/remote.json`（`remote.urls` 通配 http/https）。
- 安全权衡：仅暴露受限的桥命令；webview 只加载用户自己配置的服务器，外站导航（如 OAuth）已被转交系统浏览器，故通配 remote 的暴露面可控。
