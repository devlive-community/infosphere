# InfoSphere Android 客户端

Kotlin + Jetpack Compose 实现的 Android 客户端，连接自托管的 InfoSphere 服务器。

## 构建

使用 Android Studio 打开本目录，或命令行：

```bash
./gradlew assembleDebug     # 需要 Android SDK (compileSdk 35)
```

## 功能

- 服务器地址配置（首次启动 / 可随时切换）；
- 账户登录，令牌持久化，可退出登录；
- 书籍列表（登录后展示「我的书籍」，未登录浏览公开书籍）+ 标题搜索（300ms 防抖）；
- 通知铃铛：未读徽标 + 底部弹层列表 + 全部已读；
- 章节目录与正文阅读。

后续可扩展：离线缓存、Markdown 渲染、编辑与上传。
