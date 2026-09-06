#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::sync::{Arc, Mutex};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

/// 客户端配置文件路径（应用配置目录下 config.json）
fn config_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join("config.json"))
}

fn read_server_url(app: &AppHandle) -> Option<String> {
    let raw = fs::read_to_string(config_path(app)?).ok()?;
    let value: serde_json::Value = serde_json::from_str(&raw).ok()?;
    value.get("server_url")?.as_str().map(String::from)
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

/// 清除配置并回到服务器设置页（托盘「切换服务器」与设置页按钮共用）
fn reset_to_setup(app: &AppHandle) -> Result<(), String> {
    if let Some(path) = config_path(app) {
        let _ = fs::remove_file(path);
    }
    if let Some(state) = app.try_state::<AppState>() {
        *state.info.lock().unwrap() = ServerInfo::default();
    }
    navigate_main(
        app,
        tauri::Url::parse("tauri://localhost").map_err(|e| e.to_string())?,
    )
}

#[derive(Default, serde::Serialize, Clone)]
struct ServerInfo {
    url: Option<String>,
    error: Option<String>,
}

struct AppState {
    info: Arc<Mutex<ServerInfo>>,
}

/// 站点根 origin（scheme://host[:port]），用于主窗口导航的同源判定
fn origin_of(url: &tauri::Url) -> String {
    let port = url.port().map(|p| format!(":{}", p)).unwrap_or_default();
    format!(
        "{}://{}{}",
        url.scheme(),
        url.host_str().unwrap_or(""),
        port
    )
}

/// 本地设置页地址（Linux 上自定义协议是 http://tauri.localhost）
fn is_local_setup(url: &tauri::Url) -> bool {
    url.scheme() == "tauri" || url.host_str() == Some("tauri.localhost")
}

#[tauri::command]
fn get_server_info(state: State<'_, AppState>) -> ServerInfo {
    state.info.lock().unwrap().clone()
}

#[tauri::command]
fn save_server_url(app: AppHandle, state: State<'_, AppState>, url: String) -> Result<(), String> {
    let url = normalize_url(&url)?;
    probe_server(&url)?;

    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(
        dir.join("config.json"),
        serde_json::json!({ "server_url": url }).to_string(),
    )
    .map_err(|e| e.to_string())?;
    *state.info.lock().unwrap() = ServerInfo {
        url: Some(url.clone()),
        error: None,
    };

    navigate_main(&app, tauri::Url::parse(&url).map_err(|e| e.to_string())?)
}

#[tauri::command]
fn reset_server(app: AppHandle) -> Result<(), String> {
    reset_to_setup(&app)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            info: Arc::new(Mutex::new(ServerInfo::default())),
        })
        .setup(|app| {
            let handle = app.handle().clone();

            // 主窗口运行时创建：挂接 new-window / navigation 拦截，
            // target="_blank" 与跨源导航转交系统浏览器，webview 内只承载本站。
            let shared = app.state::<AppState>().info.clone();
            let nav_handle = handle.clone();
            let new_window_handle = handle.clone();
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("InfoSphere")
                .inner_size(1280.0, 840.0)
                .min_inner_size(960.0, 640.0)
                .on_new_window(move |url, _| {
                    let _ = new_window_handle
                        .opener()
                        .open_url(url.as_str(), None::<&str>);
                    tauri::webview::NewWindowResponse::Deny
                })
                .on_navigation(move |url| {
                    if is_local_setup(url) {
                        return true;
                    }
                    if url.scheme() != "http" && url.scheme() != "https" {
                        return true;
                    }
                    let saved = shared.lock().unwrap().url.clone();
                    let same_origin = saved
                        .as_deref()
                        .and_then(|server| tauri::Url::parse(server).ok())
                        .map(|server| origin_of(&server) == origin_of(url))
                        .unwrap_or(false);
                    if same_origin {
                        true
                    } else {
                        let _ = nav_handle.opener().open_url(url.as_str(), None::<&str>);
                        false
                    }
                })
                .build()?;
            let _ = window;

            // 已保存地址则先探测可达性：可达直接进入，失败留在设置页并显示原因
            let saved = read_server_url(&handle);
            if let Some(saved) = &saved {
                *app.state::<AppState>().info.lock().unwrap() = ServerInfo {
                    url: Some(saved.clone()),
                    error: None,
                };
            }
            if let Some(saved) = saved {
                match probe_server(&saved) {
                    Ok(()) => {
                        if let Some(state) = handle.try_state::<AppState>() {
                            *state.info.lock().unwrap() = ServerInfo {
                                url: Some(saved.clone()),
                                error: None,
                            };
                        }
                        if let Ok(parsed) = tauri::Url::parse(&saved) {
                            if let Some(window) = handle.get_webview_window("main") {
                                let _ = window.navigate(parsed);
                            }
                        }
                    }
                    Err(err) => {
                        if let Some(state) = handle.try_state::<AppState>() {
                            *state.info.lock().unwrap() = ServerInfo {
                                url: Some(saved),
                                error: Some(err),
                            };
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
            save_server_url,
            reset_server
        ])
        .run(tauri::generate_context!())
        .expect("InfoSphere 桌面端启动失败");
}
