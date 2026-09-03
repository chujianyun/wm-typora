pub mod commands;
pub mod error;
pub mod state;

use commands::watcher::WatchState;
use state::AccessState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AccessState::default())
        .manage(WatchState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            commands::grant_path,
            commands::files::read_text_file,
            commands::files::write_text_file_atomic,
            commands::files::write_export_file,
            commands::workspace::scan_workspace,
            commands::images::copy_image,
            commands::images::store_image,
            commands::watcher::start_file_watch,
            commands::watcher::stop_file_watch,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run WTypora");
}
