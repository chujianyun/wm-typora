use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
};
use tauri::{Emitter, Manager, WebviewWindow};
use wtypora_document_core::Registry;
mod commands;
mod exports;
mod images;
#[cfg(target_os = "macos")]
mod launch;
mod opening;
#[cfg(target_os = "macos")]
mod pdf;
mod recent;
mod uploads;
mod window_commands;
mod windows;
pub struct AppState {
    pub recent: Mutex<recent::RecentFiles>,
    pub registry: Arc<Registry>,
    pub pending: Mutex<HashMap<String, PathBuf>>,
    pub window_state: Mutex<HashMap<String, bool>>,
    pub quitting: AtomicBool,
}
pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            app.manage(AppState {
                recent: Mutex::new(recent::RecentFiles::load(dir.join("recent-files.json"))),
                registry: Arc::new(Registry::new(dir)),
                pending: Mutex::new(HashMap::new()),
                window_state: Mutex::new(HashMap::new()),
                quitting: AtomicBool::new(false),
            });
            windows::install_menu(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::DragDrop(drop) = event {
                match drop {
                    tauri::DragDropEvent::Enter { .. } => {
                        let _ = window.emit("document-drag-state", true);
                    }
                    tauri::DragDropEvent::Drop { .. } | tauri::DragDropEvent::Leave => {
                        let _ = window.emit("document-drag-state", false);
                    }
                    _ => {}
                }
                if let Err(error) = opening::handle_drop(drop, |path| {
                    windows::open_path(window.app_handle(), path, Some(window.label()))
                }) {
                    let _ = window.emit("document-open-error", error);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::initialize,
            commands::new_window,
            commands::open_document,
            commands::open_path,
            commands::recent_files,
            commands::window_state,
            uploads::upload_image,
            exports::export_document,
            exports::export_image,
            exports::reveal_in_folder,
            images::read_local_image,
            commands::save_document,
            commands::save_as,
            commands::inspect_document,
            commands::reload_document,
            commands::commit_reload,
            commands::write_recovery,
            commands::list_recovery,
            commands::restore_recovery,
            commands::discard_recovery,
            commands::close_document,
            commands::release_document,
            commands::cancel_quit
        ])
        .build(tauri::generate_context!())
        .expect("desktop initialization failed");
    #[cfg(target_os = "macos")]
    let mut launch_files = launch::LaunchFiles::default();
    app.run(move |handle, event| {
        #[cfg(target_os = "macos")]
        for path in launch_files.on_event(&event) {
            let _ = windows::open_path(handle, path, None);
        }
        if let tauri::RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::Destroyed,
            ..
        } = &event
        {
            handle
                .state::<AppState>()
                .window_state
                .lock()
                .unwrap()
                .remove(label);
            handle
                .state::<AppState>()
                .pending
                .lock()
                .unwrap()
                .remove(label);
        }
        if let tauri::RunEvent::WindowEvent {
            event: tauri::WindowEvent::Destroyed,
            ..
        } = event
            && handle.state::<AppState>().quitting.load(Ordering::SeqCst)
            && handle.webview_windows().is_empty()
        {
            handle.exit(0);
        }
    });
}
pub fn request_close_all(app: &tauri::AppHandle) {
    app.state::<AppState>()
        .quitting
        .store(true, Ordering::SeqCst);
    let windows: Vec<WebviewWindow> = app.webview_windows().into_values().collect();
    if windows.is_empty() {
        app.exit(0);
    }
    for w in windows {
        let _ = window_commands::send(&w, "document.close");
    }
}
