use crate::AppState;
use std::path::PathBuf;
use tauri::{
    Emitter, Manager,
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
};
pub fn create(app: &tauri::AppHandle, path: Option<PathBuf>) -> tauri::Result<()> {
    let label = format!("doc-{}", uuid::Uuid::new_v4());
    if let Some(p) = path {
        app.state::<AppState>()
            .pending
            .lock()
            .unwrap()
            .insert(label.clone(), p);
    }
    tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::App("index.html".into()))
        .title("无标题 — WTypora")
        .inner_size(1000., 760.)
        .min_inner_size(580., 420.)
        .build()?;
    Ok(())
}
pub fn open_path(
    app: &tauri::AppHandle,
    path: PathBuf,
    preferred: Option<&str>,
) -> Result<(), String> {
    let path = crate::opening::validate_path(&path)?;
    let state = app.state::<AppState>();
    let pending_owner = state
        .pending
        .lock()
        .unwrap()
        .iter()
        .find(|(_, p)| *p == &path)
        .map(|(owner, _)| owner.clone());
    if let Some(owner) = state.registry.owner_for_path(&path).or(pending_owner)
        && let Some(w) = app.get_webview_window(&owner)
    {
        w.show().map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
        if state.registry.owner_for_path(&path).is_some() {
            crate::recent::record(app, &path);
        }
        return Ok(());
    }
    let windows = app.webview_windows();
    let readiness = state.window_state.lock().unwrap();
    // Do not overwrite a file already queued for a window that is still starting.
    let available = |window: &&tauri::WebviewWindow| {
        readiness.contains_key(window.label())
            || !state.pending.lock().unwrap().contains_key(window.label())
    };
    let target = preferred
        .and_then(|label| windows.get(label))
        .filter(available)
        .or_else(|| {
            windows
                .values()
                .find(|w| readiness.get(w.label()) == Some(&true))
        })
        .or_else(|| {
            windows
                .values()
                .filter(available)
                .find(|w| w.is_focused().unwrap_or(false))
        })
        .or_else(|| {
            windows
                .values()
                .find(|w| !state.pending.lock().unwrap().contains_key(w.label()))
        });
    if let Some(window) = target {
        if readiness.contains_key(window.label()) {
            window
                .emit("document-open-request", path)
                .map_err(|e| e.to_string())?;
        } else {
            state
                .pending
                .lock()
                .unwrap()
                .insert(window.label().into(), path);
        }
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    drop(readiness);
    create(app, Some(path)).map_err(|e| e.to_string())
}
pub fn install_menu(app: &tauri::App) -> tauri::Result<()> {
    let h = app.handle();
    let new = MenuItem::with_id(h, "document.new", "新建", true, Some("CmdOrCtrl+N"))?;
    let open = MenuItem::with_id(h, "document.open", "打开…", true, Some("CmdOrCtrl+O"))?;
    let recent = MenuItem::with_id(h, "document.recent", "最近打开…", true, None::<&str>)?;
    let save = MenuItem::with_id(h, "document.save", "保存", true, Some("CmdOrCtrl+S"))?;
    let save_as = MenuItem::with_id(
        h,
        "document.saveAs",
        "另存为…",
        true,
        Some("CmdOrCtrl+Shift+S"),
    )?;
    let export_docx = MenuItem::with_id(
        h,
        "document.exportDocx",
        "导出 Word（.docx）…",
        true,
        None::<&str>,
    )?;
    let export_pdf = MenuItem::with_id(h, "document.exportPdf", "导出 PDF…", true, None::<&str>)?;
    let close = MenuItem::with_id(h, "document.close", "关闭文档", true, Some("CmdOrCtrl+W"))?;
    let quit = MenuItem::with_id(h, "quit", "退出 WTypora", true, Some("CmdOrCtrl+Q"))?;
    let settings = MenuItem::with_id(h, "app.settings", "设置…", true, Some("CmdOrCtrl+,"))?;
    let app_menu = Submenu::with_items(
        h,
        "WTypora",
        true,
        &[
            &PredefinedMenuItem::about(h, Some("关于 WTypora"), None)?,
            &settings,
            &quit,
        ],
    )?;
    let file = Submenu::with_items(
        h,
        "文件",
        true,
        &[
            &new,
            &open,
            &recent,
            &save,
            &save_as,
            &PredefinedMenuItem::separator(h)?,
            &export_docx,
            &export_pdf,
            &PredefinedMenuItem::separator(h)?,
            &close,
        ],
    )?;
    let undo = MenuItem::with_id(h, "edit.undo", "撤销", true, Some("CmdOrCtrl+Z"))?;
    let redo = MenuItem::with_id(h, "edit.redo", "重做", true, Some("CmdOrCtrl+Shift+Z"))?;
    let edit = Submenu::with_items(
        h,
        "编辑",
        true,
        &[
            &undo,
            &redo,
            &PredefinedMenuItem::separator(h)?,
            &PredefinedMenuItem::cut(h, None)?,
            &PredefinedMenuItem::copy(h, None)?,
            &PredefinedMenuItem::paste(h, None)?,
            &PredefinedMenuItem::select_all(h, None)?,
        ],
    )?;
    let menu = Menu::with_items(h, &[&app_menu, &file, &edit])?;
    app.set_menu(menu)?;
    app.on_menu_event(|app, event| {
        let id = event.id().as_ref();
        if id == "quit" {
            crate::request_close_all(app);
            return;
        }
        if id == "document.new" {
            let _ = create(app, None);
            return;
        }
        if let Some(w) = app
            .webview_windows()
            .into_values()
            .find(|w| w.is_focused().unwrap_or(false))
        {
            let _ = crate::window_commands::send(&w, id);
        }
    });
    Ok(())
}
