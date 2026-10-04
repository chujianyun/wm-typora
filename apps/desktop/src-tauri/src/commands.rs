use crate::{AppState, windows};
use std::sync::atomic::Ordering;
use tauri::{Manager, State, WebviewWindow};
use wtypora_document_core::{
    CoreError, DiskEvent, Opened, RecoveryList, RecoverySnapshot, Revision, SaveAsResult,
    SaveReply, SaveRequest,
};
#[tauri::command]
pub fn initialize(w: WebviewWindow, s: State<AppState>) -> Result<Opened, CoreError> {
    let mut readiness = s.window_state.lock().unwrap();
    let path = s.pending.lock().unwrap().remove(w.label());
    readiness.insert(w.label().into(), false);
    drop(readiness);
    let opened = match path {
        Some(p) => s.registry.open(&p, w.label()),
        None => s.registry.create(w.label()),
    }?;
    if let Some(path) = &opened.path {
        crate::recent::record(w.app_handle(), std::path::Path::new(path));
    }
    Ok(opened)
}
#[tauri::command]
pub fn recent_files(s: State<AppState>) -> Vec<std::path::PathBuf> {
    s.recent.lock().unwrap().list()
}
#[tauri::command]
pub fn new_window(app: tauri::AppHandle) -> Result<(), String> {
    windows::create(&app, None).map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn open_document(
    app: tauri::AppHandle,
    w: WebviewWindow,
    replace: Option<Replacement>,
) -> Result<Option<Opened>, String> {
    let path = tauri::async_runtime::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("打开 Markdown 文件")
            .add_filter("Markdown / 纯文本", crate::opening::DOCUMENT_EXTENSIONS)
            .pick_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    if let Some(p) = path {
        return open_path(app, w, p, replace).await;
    }
    Ok(None)
}
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Replacement {
    session_id: String,
    epoch: u64,
}

#[tauri::command]
pub fn window_state(w: WebviewWindow, s: State<AppState>, reusable: bool) {
    s.window_state
        .lock()
        .unwrap()
        .insert(w.label().into(), reusable);
}

#[tauri::command]
pub async fn open_path(
    app: tauri::AppHandle,
    w: WebviewWindow,
    path: std::path::PathBuf,
    replace: Option<Replacement>,
) -> Result<Option<Opened>, String> {
    let path = crate::opening::validate_path(&path)?;
    let state = app.state::<AppState>();
    let pending_owner = state
        .pending
        .lock()
        .unwrap()
        .iter()
        .find(|(_, p)| *p == &path)
        .map(|(label, _)| label.clone());
    if let Some(owner) = state.registry.owner_for_path(&path).or(pending_owner)
        && let Some(window) = app.get_webview_window(&owner)
    {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        if state.registry.owner_for_path(&path).is_some() {
            crate::recent::record(&app, &path);
        }
        return Ok(None);
    }
    if let Some(replace) = replace {
        let core = state.registry.clone();
        let owner = w.label().to_string();
        let opened = tauri::async_runtime::spawn_blocking(move || {
            core.replace_untitled(&path, &replace.session_id, replace.epoch, &owner)
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.message)?;
        if let Some(path) = &opened.path {
            crate::recent::record(&app, std::path::Path::new(path));
        }
        return Ok(Some(opened));
    }
    windows::create(&app, Some(path)).map_err(|e| e.to_string())?;
    Ok(None)
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
    let result = tauri::async_runtime::spawn_blocking(move || {
        let path = rfd::FileDialog::new()
            .set_file_name("无标题.md")
            .add_filter("Markdown", &["md", "markdown"])
            .save_file();
        path.map(|p| core.save_as(request, &p, &owner)).transpose()
    })
    .await
    .map_err(|_| CoreError::new("io", "保存任务失败"))??;
    if let Some(result) = &result
        && let Some(path) = &result.opened.path
    {
        crate::recent::record(w.app_handle(), std::path::Path::new(path));
    }
    Ok(result)
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
