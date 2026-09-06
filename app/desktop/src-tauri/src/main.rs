#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::sync::Mutex;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, State};

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
    info: Mutex<ServerInfo>,
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
        .manage(AppState {
            info: Mutex::new(ServerInfo::default()),
        })
        .setup(|app| {
            let handle = app.handle().clone();

            // 已保存地址则先探测可达性：可达直接进入，失败留在设置页并显示原因
            if let Some(saved) = read_server_url(&handle) {
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
