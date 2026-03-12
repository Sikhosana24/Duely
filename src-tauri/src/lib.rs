use tauri::Manager;
use std::sync::Mutex;

#[derive(Default)]
struct OverlayState {
    normal_size: Option<tauri::PhysicalSize<u32>>,
    normal_position: Option<tauri::PhysicalPosition<i32>>,
    pill_mode: bool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_ignore_cursor_events(false);
                let _ = window.set_content_protected(false);
            }

            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::ShortcutState;

                let shortcut_plugin = tauri_plugin_global_shortcut::Builder::new()
                    .with_shortcut("ctrl+shift+o")
                    .and_then(|builder| {
                        Ok(builder.with_handler(|app, _shortcut, event| {
                            if event.state != ShortcutState::Pressed {
                                return;
                            }
                            let Some(window) = app.get_webview_window("main") else {
                                return;
                            };
                            let visible = window.is_visible().unwrap_or(true);
                            if visible {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }))
                    })
                    .and_then(|builder| Ok(builder.build()));

                match shortcut_plugin {
                    Ok(plugin) => {
                        if let Err(err) = app.handle().plugin(plugin) {
                            eprintln!("global shortcut plugin failed to load: {err}");
                        }
                    }
                    Err(err) => {
                        eprintln!("global shortcut registration failed: {err}");
                    }
                }
            }

            Ok(())
        })
        .manage(Mutex::new(OverlayState::default()))
        .invoke_handler(tauri::generate_handler![
            toggle_clickthrough,
            set_pill_mode,
            snap_to_corner,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn toggle_clickthrough(window: tauri::WebviewWindow, enabled: bool) -> Result<(), String> {
    window
        .set_ignore_cursor_events(enabled)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_pill_mode(
    window: tauri::WebviewWindow,
    enabled: bool,
    state: tauri::State<'_, Mutex<OverlayState>>,
) -> Result<(), String> {
    let mut overlay = state.lock().map_err(|_| "Overlay state poisoned".to_string())?;

    if enabled == overlay.pill_mode {
        return Ok(());
    }

    if enabled {
        overlay.normal_size = window.outer_size().ok();
        overlay.normal_position = window.outer_position().ok();
        overlay.pill_mode = true;
        window
            .set_size(tauri::Size::Physical(tauri::PhysicalSize::new(56, 56)))
            .map_err(|e| e.to_string())?;
        window
            .set_content_protected(true)
            .map_err(|e| e.to_string())?;
    } else {
        overlay.pill_mode = false;
        window
            .set_content_protected(false)
            .map_err(|e| e.to_string())?;
        if let Some(size) = overlay.normal_size.take() {
            window
                .set_size(tauri::Size::Physical(size))
                .map_err(|e| e.to_string())?;
        }
        if let Some(position) = overlay.normal_position.take() {
            window
                .set_position(tauri::Position::Physical(position))
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
fn snap_to_corner(window: tauri::WebviewWindow, corner: String) -> Result<(), String> {
    let margin_px: i32 = 20;

    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or_else(|| "No monitor available".to_string())?;

    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let win_size = window.outer_size().map_err(|e| e.to_string())?;

    let max_x = monitor_position.x + (monitor_size.width as i32) - (win_size.width as i32) - margin_px;
    let max_y = monitor_position.y + (monitor_size.height as i32) - (win_size.height as i32) - margin_px;
    let min_x = monitor_position.x + margin_px;
    let min_y = monitor_position.y + margin_px;

    let (x, y) = match corner.as_str() {
        "top_left" | "tl" => (min_x, min_y),
        "top_right" | "tr" => (max_x, min_y),
        "bottom_left" | "bl" => (min_x, max_y),
        "bottom_right" | "br" => (max_x, max_y),
        _ => return Err("corner must be one of: top_left, top_right, bottom_left, bottom_right".to_string()),
    };

    window
        .set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(x, y)))
        .map_err(|e| e.to_string())?;

    Ok(())
}
