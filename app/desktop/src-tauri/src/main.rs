#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use tauri::Manager;

/// 客户端配置文件路径（应用配置目录下 config.json）
fn config_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join("config.json"))
}

fn read_server_url(app: &tauri::AppHandle) -> Option<String> {
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

fn navigate_main(app: &tauri::AppHandle, url: tauri::Url) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or("未找到主窗口")?
        .navigate(url)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn save_server_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let url = normalize_url(&url)?;
    // 先验证服务可达
    let status_url = format!("{}/api/v1/setup/status", url.trim_end_matches('/'));
    let resp = ureq::get(&status_url)
        .timeout(std::time::Duration::from_secs(5))
        .call()
        .map_err(|e| format!("无法连接到服务器: {}", e))?
        .into_string()
        .map_err(|e| e.to_string())?;
    if !resp.contains("\"success\"") || !resp.contains("installed") {
        return Err("该地址不是 InfoSphere 服务".into());
    }

    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(
        dir.join("config.json"),
        serde_json::json!({ "server_url": url }).to_string(),
    )
    .map_err(|e| e.to_string())?;

    navigate_main(&app, tauri::Url::parse(&url).map_err(|e| e.to_string())?)
}

#[tauri::command]
fn reset_server(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(path) = config_path(&app) {
        let _ = fs::remove_file(path);
    }
    navigate_main(&app, tauri::Url::parse("tauri://localhost").map_err(|e| e.to_string())?)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // 已配置服务器则直接进入远程界面
            if let Some(url) = read_server_url(app.handle()) {
                if let Ok(parsed) = tauri::Url::parse(&url) {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.navigate(parsed);
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![save_server_url, reset_server])
        .run(tauri::generate_context!())
        .expect("InfoSphere 桌面端启动失败");
}
