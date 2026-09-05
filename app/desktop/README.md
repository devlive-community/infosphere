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

- 首次启动显示服务器地址设置页，验证 `/api/v1/setup/status` 可达后保存并跳转；
- 服务器地址保存在系统应用配置目录（`config.json`），下次启动自动直连；
- 点击「清除已保存的服务器」可重新配置。

桌面端复用服务端内嵌的 Next.js 界面，所有业务逻辑与数据都保存在服务器上。
