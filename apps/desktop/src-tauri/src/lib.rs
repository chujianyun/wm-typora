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
mod windows;
pub struct AppState {
    pub registry: Arc<Registry>,
    pub pending: Mutex<HashMap<String, PathBuf>>,
    pub quitting: AtomicBool,
}
pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            app.manage(AppState {
                registry: Arc::new(Registry::new(dir)),
                pending: Mutex::new(HashMap::new()),
                quitting: AtomicBool::new(false),
            });
            windows::install_menu(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::initialize,
            commands::new_window,
            commands::open_document,
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
    app.run(|handle, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = &event {
            for url in urls {
                if let Ok(path) = url.to_file_path() {
                    let _ = windows::open_path(handle, path);
                }
            }
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
        let _ = w.emit("document-command", "document.close");
    }
}
