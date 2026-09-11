#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod store;

use std::fs;
use std::sync::{Arc, Mutex};
use store::{ServerRow, Store};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

/// 数据库文件路径（应用配置目录下 infosphere.db）
fn db_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join("infosphere.db"))
}

/// 旧版配置文件路径（应用配置目录下 config.json），用于一次性迁移
fn legacy_config_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join("config.json"))
}

/// 归一化服务器地址：补全协议、去掉末尾斜杠
fn normalize_url(input: &str) -> Result<String, String> {
    let trimmed = input.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("请输入服务器地址".into());
    }
    let url = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("http://{}", trimmed)
    };
    tauri::Url::parse(&url)
        .map(|u| u.to_string())
        .map_err(|e| format!("地址无效: {}", e))
}

/// 验证地址指向 InfoSphere 服务（/api/v1/setup/status 可达且结构正确）
fn probe_server(url: &str) -> Result<(), String> {
    let status_url = format!("{}/api/v1/setup/status", url.trim_end_matches('/'));
    let resp = ureq::get(&status_url)
        .timeout(std::time::Duration::from_secs(3))
        .call()
        .map_err(|e| format!("无法连接到服务器: {}", e))?
        .into_string()
        .map_err(|e| e.to_string())?;
    if !resp.contains("\"success\"") || !resp.contains("installed") {
        return Err("该地址不是 InfoSphere 服务".into());
    }
    Ok(())
}

fn navigate_main(app: &AppHandle, url: tauri::Url) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or("未找到主窗口")?
        .navigate(url)
        .map_err(|e| e.to_string())
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// 清除激活服务器并回到服务器设置页（保留已存服务器，供快速重连）。
/// 托盘「切换服务器」与设置页共用。
fn reset_to_setup(app: &AppHandle) -> Result<(), String> {
    let mut home = "tauri://localhost".to_string();
    if let Some(state) = app.try_state::<AppState>() {
        let _ = state.store.lock().unwrap().clear_active();
        *state.info.lock().unwrap() = ServerInfo::default();
        let h = state.home.lock().unwrap().clone();
        if !h.is_empty() {
            home = h;
        }
    }
    navigate_main(app, tauri::Url::parse(&home).map_err(|e| e.to_string())?)
}

#[derive(Default, serde::Serialize, Clone)]
struct ServerInfo {
    url: Option<String>,
    error: Option<String>,
}

struct AppState {
    info: Arc<Mutex<ServerInfo>>,
    store: Arc<Mutex<Store>>,
    /// 应用自身前端首页地址（设置页）。生产为 tauri://localhost，开发为内建 dev server 地址；
    /// 窗口创建后由 `window.url()` 捕获，供「切换服务器 / 重置」跳回，避免硬编码在 dev 下失效。
    home: Arc<Mutex<String>>,
}

/// 归一化主机名：localhost 与回环地址视为等价，忽略大小写
fn host_key(url: &tauri::Url) -> String {
    match url.host_str() {
        Some("127.0.0.1") | Some("::1") | Some("localhost") => "localhost".to_string(),
        Some(h) => h.to_ascii_lowercase(),
        None => String::new(),
    }
}

/// 由任意地址字符串取主机名 key（无法解析时返回空串）
fn host_key_from_str(s: &str) -> String {
    tauri::Url::parse(s)
        .map(|u| host_key(&u))
        .unwrap_or_default()
}

/// 取地址的 origin（scheme://host[:port]），与浏览器 location.origin 对齐（省略默认端口）
fn origin_of(url: &str) -> Option<String> {
    let parsed = tauri::Url::parse(url).ok()?;
    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return None;
    }
    let host = parsed.host_str()?;
    let mut origin = format!("{}://{}", scheme, host);
    if let Some(port) = parsed.port() {
        let is_default = (scheme == "http" && port == 80) || (scheme == "https" && port == 443);
        if !is_default {
            origin.push_str(&format!(":{}", port));
        }
    }
    Some(origin)
}

/// 是否与已连接服务器同站：仅比较主机名，忽略协议与端口。
/// 服务端在 http/https 或不同端口间重定向时不再把整个站点弹到系统浏览器。
fn same_site(server: &tauri::Url, url: &tauri::Url) -> bool {
    host_key(server) == host_key(url)
}

/// 本地设置页 / 应用自身前端地址，始终留在 webview 内：
/// - 生产：自定义协议 `tauri://localhost`（Linux/Windows 为 `http://tauri.localhost`）；
/// - 开发：Tauri 内建 dev server 走 `http://127.0.0.1:<port>` / `http://localhost:<port>`。
///
/// 回环地址一律视为本地——本机自托管服务器也应留在 webview，不存在需要弹到系统浏览器的回环场景。
fn is_local_setup(url: &tauri::Url) -> bool {
    url.scheme() == "tauri"
        || matches!(
            url.host_str(),
            Some("tauri.localhost") | Some("127.0.0.1") | Some("localhost") | Some("::1")
        )
}

/// 生成注入 webview 的桥脚本：
/// 1) 若当前页面正是激活服务器且带令牌，同步 seed 到 localStorage（先于 web 端读取，恢复登录态）；
/// 2) 包裹 localStorage 的 set/removeItem，将令牌变化经 IPC 回写/清除到 SQLite。
fn bridge_script(active_origin: &str, seed_token: &str) -> String {
    // active_origin / seed_token 均由 Rust 生成，不含用户输入的引号风险；仍做转义兜底。
    let esc = |s: &str| s.replace('\\', "\\\\").replace('\'', "\\'");
    format!(
        r#"(function(){{
  try {{
    var ACTIVE_ORIGIN = '{origin}';
    var SEED_TOKEN = '{token}';
    var TOKEN_KEY = 'infosphere_token';
    if (SEED_TOKEN && ACTIVE_ORIGIN && location.origin === ACTIVE_ORIGIN && !localStorage.getItem(TOKEN_KEY)) {{
      localStorage.setItem(TOKEN_KEY, SEED_TOKEN);
    }}
    var T = window.__TAURI__;
    var invoke = T && T.core && T.core.invoke;
    if (!invoke) return;
    var _set = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(k, v) {{
      _set(k, v);
      if (k === TOKEN_KEY) invoke('bridge_save_token', {{ origin: location.origin, token: String(v) }}).catch(function(){{}});
    }};
    var _rem = localStorage.removeItem.bind(localStorage);
    localStorage.removeItem = function(k) {{
      _rem(k);
      if (k === TOKEN_KEY) invoke('bridge_clear_token', {{ origin: location.origin }}).catch(function(){{}});
    }};
  }} catch (e) {{}}
}})();"#,
        origin = esc(active_origin),
        token = esc(seed_token),
    )
}

/// 在服务器列表中按 origin 主机匹配出对应的服务器地址（用于令牌回写定位）
fn resolve_url_by_origin(store: &Store, origin: &str) -> Option<String> {
    let host = host_key_from_str(origin);
    if host.is_empty() {
        return None;
    }
    let matched = store
        .list_servers()
        .ok()?
        .into_iter()
        .map(|s| s.url)
        .find(|u| host_key_from_str(u) == host);
    matched.or_else(|| store.active_server().ok().flatten())
}

#[tauri::command]
fn get_server_info(state: State<'_, AppState>) -> ServerInfo {
    state.info.lock().unwrap().clone()
}

#[tauri::command]
fn list_servers(state: State<'_, AppState>) -> Result<Vec<ServerRow>, String> {
    state
        .store
        .lock()
        .unwrap()
        .list_servers()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn save_server_url(app: AppHandle, state: State<'_, AppState>, url: String) -> Result<(), String> {
    let url = normalize_url(&url)?;
    probe_server(&url)?;

    {
        let store = state.store.lock().unwrap();
        store.upsert_server(&url, None).map_err(|e| e.to_string())?;
        store.set_active(&url).map_err(|e| e.to_string())?;
    }
    *state.info.lock().unwrap() = ServerInfo {
        url: Some(url.clone()),
        error: None,
    };

    navigate_main(&app, tauri::Url::parse(&url).map_err(|e| e.to_string())?)
}

/// 切换到某个已存服务器（探测可达后设为激活并跳转）
#[tauri::command]
fn switch_server(app: AppHandle, state: State<'_, AppState>, url: String) -> Result<(), String> {
    let url = normalize_url(&url)?;
    probe_server(&url)?;
    {
        let store = state.store.lock().unwrap();
        store.set_active(&url).map_err(|e| e.to_string())?;
    }
    *state.info.lock().unwrap() = ServerInfo {
        url: Some(url.clone()),
        error: None,
    };
    navigate_main(&app, tauri::Url::parse(&url).map_err(|e| e.to_string())?)
}

/// 删除某个已存服务器（连同其令牌）
#[tauri::command]
fn remove_server(state: State<'_, AppState>, url: String) -> Result<(), String> {
    let url = normalize_url(&url)?;
    state
        .store
        .lock()
        .unwrap()
        .remove_server(&url)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn reset_server(app: AppHandle) -> Result<(), String> {
    reset_to_setup(&app)
}

/// 供注入脚本读取某 origin 对应服务器的令牌（当前实现走启动时同步 seed，此命令备用）
#[tauri::command]
fn bridge_get_token(state: State<'_, AppState>, origin: String) -> Option<String> {
    let store = state.store.lock().unwrap();
    let url = resolve_url_by_origin(&store, &origin)?;
    store.token(&url).ok().flatten()
}

/// 注入脚本在 web 端写入令牌时回写 SQLite
#[tauri::command]
fn bridge_save_token(
    state: State<'_, AppState>,
    origin: String,
    token: String,
) -> Result<(), String> {
    let store = state.store.lock().unwrap();
    if let Some(url) = resolve_url_by_origin(&store, &origin) {
        store
            .set_token(&url, Some(&token))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 注入脚本在 web 端退出登录（移除令牌）时清除 SQLite 中的令牌
#[tauri::command]
fn bridge_clear_token(state: State<'_, AppState>, origin: String) -> Result<(), String> {
    let store = state.store.lock().unwrap();
    if let Some(url) = resolve_url_by_origin(&store, &origin) {
        store.set_token(&url, None).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 首次启动时把旧版 config.json 的 server_url 迁移进 SQLite，然后删除旧文件
fn migrate_legacy_config(app: &AppHandle, store: &Store) {
    let Some(path) = legacy_config_path(app) else {
        return;
    };
    let Ok(raw) = fs::read_to_string(&path) else {
        return;
    };
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) {
        if let Some(url) = value.get("server_url").and_then(|v| v.as_str()) {
            if let Ok(url) = normalize_url(url) {
                let _ = store.upsert_server(&url, None);
                let _ = store.set_active(&url);
            }
        }
    }
    let _ = fs::remove_file(path);
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();

            // 打开本地 SQLite 并迁移旧配置
            let dir = app.path().app_config_dir()?;
            fs::create_dir_all(&dir)?;
            let store = Store::open(&db_path(&handle).ok_or("无法确定数据库路径")?)?;
            migrate_legacy_config(&handle, &store);

            // 读取激活服务器及其令牌，用于窗口注入脚本的同步 seed
            let active = store.active_server().ok().flatten();
            let seed_token = active
                .as_deref()
                .and_then(|u| store.token(u).ok().flatten())
                .unwrap_or_default();
            let active_origin = active.as_deref().and_then(origin_of).unwrap_or_default();

            app.manage(AppState {
                info: Arc::new(Mutex::new(ServerInfo {
                    url: active.clone(),
                    error: None,
                })),
                store: Arc::new(Mutex::new(store)),
                home: Arc::new(Mutex::new(String::new())),
            });

            // 主窗口运行时创建：挂接 new-window / navigation 拦截，
            // target="_blank" 与用户点击的跨源链接转交系统浏览器，webview 内只承载本站与 OAuth 流程。
            let shared = app.state::<AppState>().info.clone();
            let nav_handle = handle.clone();
            let new_window_handle = handle.clone();
            // OAuth 进行中标记：同站命中 /api/v1/auth/oauth/ 时置位，回到普通同站页面时清除。
            // 置位期间放行跨站导航（如 GitHub 授权页），使整个授权回调链留在 webview 内，
            // 否则授权页被弹到系统浏览器，桌面端拿不到回跳携带的登录令牌。
            let oauth_active = Arc::new(Mutex::new(false));
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("InfoSphere")
                .inner_size(1280.0, 840.0)
                .min_inner_size(960.0, 640.0)
                .initialization_script(bridge_script(&active_origin, &seed_token))
                .on_new_window(move |url, _| {
                    eprintln!("[desktop] new-window -> 系统浏览器: {}", url);
                    let _ = new_window_handle
                        .opener()
                        .open_url(url.as_str(), None::<&str>);
                    tauri::webview::NewWindowResponse::Deny
                })
                .on_navigation(move |url| {
                    // 本地设置页与非 http(s) 资源（tauri://、about:、data: 等）始终留在 webview 内
                    if is_local_setup(url) || (url.scheme() != "http" && url.scheme() != "https") {
                        eprintln!("[desktop] nav 本地/资源 -> webview: {}", url);
                        return true;
                    }
                    let saved = shared.lock().unwrap().url.clone();
                    let server = saved.as_deref().and_then(|s| tauri::Url::parse(s).ok());
                    match server {
                        // 与激活服务器同站：始终留在 webview，并据是否访问 OAuth 端点维护进行中标记
                        Some(server) if same_site(&server, url) => {
                            let in_oauth = url.path().starts_with("/api/v1/auth/oauth/");
                            *oauth_active.lock().unwrap() = in_oauth;
                            eprintln!("[desktop] nav 同站 -> webview: {}", url);
                            true
                        }
                        // 跨站：OAuth 进行中放行（授权页留在 webview），否则转交系统浏览器
                        Some(_) => {
                            if *oauth_active.lock().unwrap() {
                                eprintln!("[desktop] nav OAuth 授权页 -> webview: {}", url);
                                true
                            } else {
                                eprintln!("[desktop] nav 外站 -> 系统浏览器: {}", url);
                                let _ = nav_handle.opener().open_url(url.as_str(), None::<&str>);
                                false
                            }
                        }
                        // 未连接（设置阶段）：留在 webview
                        None => {
                            eprintln!("[desktop] nav 设置阶段 -> webview: {}", url);
                            true
                        }
                    }
                })
                .build()?;

            // 捕获前端首页地址（dev 为 http://127.0.0.1:<port>，prod 为 tauri://localhost），
            // 供「切换服务器」跳回设置页。此时尚未导航到远程服务器。
            if let Ok(url) = window.url() {
                *app.state::<AppState>().home.lock().unwrap() = url.to_string();
            }

            // 已保存地址则先探测可达性：可达直接进入，失败留在设置页并显示原因
            if let Some(saved) = active {
                match probe_server(&saved) {
                    Ok(()) => {
                        if let Ok(parsed) = tauri::Url::parse(&saved) {
                            if let Some(window) = handle.get_webview_window("main") {
                                let _ = window.navigate(parsed);
                            }
                        }
                    }
                    Err(err) => {
                        if let Some(state) = handle.try_state::<AppState>() {
                            state.info.lock().unwrap().error = Some(err);
                        }
                    }
                }
            }

            // 系统托盘：显示主窗口 / 切换服务器 / 退出
            let show_item = MenuItemBuilder::with_id("show", "显示主窗口").build(app)?;
            let switch_item = MenuItemBuilder::with_id("switch", "切换服务器").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .item(&switch_item)
                .separator()
                .item(&quit_item)
                .build()?;
            let mut tray = TrayIconBuilder::with_id("main-tray")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("InfoSphere")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => show_main(app),
                    "switch" => {
                        let _ = reset_to_setup(app);
                        show_main(app);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                });
            if let Some(icon) = app.default_window_icon().cloned() {
                tray = tray.icon(icon);
            }
            tray.build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_server_info,
            list_servers,
            save_server_url,
            switch_server,
            remove_server,
            reset_server,
            bridge_get_token,
            bridge_save_token,
            bridge_clear_token
        ])
        .run(tauri::generate_context!())
        .expect("InfoSphere 桌面端启动失败");
}
