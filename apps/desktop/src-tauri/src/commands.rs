use crate::{AppState, windows};
use std::sync::atomic::Ordering;
use tauri::{Manager, State, WebviewWindow};
use wtypora_document_core::{
    CoreError, DiskEvent, Opened, RecoveryList, RecoverySnapshot, Revision, SaveAsResult,
    SaveReply, SaveRequest,
};
#[tauri::command]
pub fn initialize(w: WebviewWindow, s: State<AppState>) -> Result<Opened, CoreError> {
    let path = s.pending.lock().unwrap().remove(w.label());
    match path {
        Some(p) => s.registry.open(&p, w.label()),
        None => s.registry.create(w.label()),
    }
}
#[tauri::command]
pub fn new_window(app: tauri::AppHandle) -> Result<(), String> {
    windows::create(&app, None).map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn open_document(app: tauri::AppHandle) -> Result<(), String> {
    let path = tauri::async_runtime::spawn_blocking(|| {
        rfd::FileDialog::new()
            .add_filter("Markdown", &["md", "markdown", "txt"])
            .pick_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    if let Some(p) = path {
        windows::open_path(&app, p).map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
pub async fn save_document(
    w: WebviewWindow,
    s: State<'_, AppState>,
    request: SaveRequest,
) -> Result<SaveReply, String> {
    let core = s.registry.clone();
    let owner = w.label().to_string();
    tauri::async_runtime::spawn_blocking(move || core.save(request, &owner))
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn save_as(
    w: WebviewWindow,
    s: State<'_, AppState>,
    request: SaveRequest,
) -> Result<Option<SaveAsResult>, CoreError> {
    let core = s.registry.clone();
    let owner = w.label().to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let path = rfd::FileDialog::new()
            .set_file_name("无标题.md")
            .add_filter("Markdown", &["md", "markdown"])
            .save_file();
        path.map(|p| core.save_as(request, &p, &owner)).transpose()
    })
    .await
    .map_err(|_| CoreError::new("io", "保存任务失败"))?
}
#[tauri::command]
pub async fn inspect_document(
    w: WebviewWindow,
    s: State<'_, AppState>,
    session_id: String,
    epoch: u64,
) -> Result<Option<DiskEvent>, CoreError> {
    let core = s.registry.clone();
    let owner = w.label().to_string();
    tauri::async_runtime::spawn_blocking(move || core.inspect(&session_id, epoch, &owner))
        .await
        .map_err(|_| CoreError::new("io", "监听任务失败"))?
}
#[tauri::command]
pub async fn reload_document(
    w: WebviewWindow,
    s: State<'_, AppState>,
    session_id: String,
    epoch: u64,
    expected: Option<Revision>,
) -> Result<Opened, CoreError> {
    let core = s.registry.clone();
    let owner = w.label().to_string();
    tauri::async_runtime::spawn_blocking(move || core.reload(&session_id, epoch, expected, &owner))
        .await
        .map_err(|_| CoreError::new("io", "读取任务失败"))?
}
#[tauri::command]
pub async fn commit_reload(
    w: WebviewWindow,
    s: State<'_, AppState>,
    session_id: String,
    epoch: u64,
    expected: Revision,
) -> Result<Opened, CoreError> {
    let core = s.registry.clone();
    let owner = w.label().to_string();
    tauri::async_runtime::spawn_blocking(move || {
        core.commit_reload(&session_id, epoch, expected, &owner)
    })
    .await
    .map_err(|_| CoreError::new("io", "读取任务失败"))?
}
#[tauri::command]
pub async fn write_recovery(
    w: WebviewWindow,
    s: State<'_, AppState>,
    snapshot: RecoverySnapshot,
) -> Result<u64, CoreError> {
    let core = s.registry.clone();
    let owner = w.label().to_string();
    tauri::async_runtime::spawn_blocking(move || core.write_recovery(snapshot, &owner))
        .await
        .map_err(|_| CoreError::new("io", "恢复日志写入失败"))?
}
#[tauri::command]
pub fn list_recovery(s: State<AppState>) -> Result<RecoveryList, CoreError> {
    s.registry.list_recovery()
}
#[tauri::command]
pub fn restore_recovery(
    w: WebviewWindow,
    s: State<AppState>,
    recovery_id: String,
) -> Result<Opened, CoreError> {
    s.registry.restore_recovery(&recovery_id, w.label())
}
#[tauri::command]
pub fn discard_recovery(
    w: WebviewWindow,
    s: State<AppState>,
    recovery_id: String,
) -> Result<(), CoreError> {
    s.registry.discard_recovery_owned(&recovery_id, w.label())
}
#[tauri::command]
pub fn close_document(
    w: WebviewWindow,
    s: State<AppState>,
    session_id: String,
) -> Result<(), CoreError> {
    s.registry.release(&session_id, w.label())?;
    w.destroy()
        .map_err(|_| CoreError::new("io", "窗口关闭失败"))
}
#[tauri::command]
pub fn cancel_quit(app: tauri::AppHandle) {
    app.state::<AppState>()
        .quitting
        .store(false, Ordering::SeqCst);
}
#[tauri::command]
pub fn release_document(
    w: WebviewWindow,
    s: State<AppState>,
    session_id: String,
) -> Result<(), CoreError> {
    s.registry.release(&session_id, w.label())
}
