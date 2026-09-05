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
pub fn open_path(app: &tauri::AppHandle, path: PathBuf) -> tauri::Result<()> {
    if let Some(owner) = app.state::<AppState>().registry.owner_for_path(&path)
        && let Some(w) = app.get_webview_window(&owner)
    {
        w.show()?;
        w.set_focus()?;
        return Ok(());
    }
    create(app, Some(path))
}
pub fn install_menu(app: &tauri::App) -> tauri::Result<()> {
    let h = app.handle();
    let new = MenuItem::with_id(h, "document.new", "新建", true, Some("CmdOrCtrl+N"))?;
    let open = MenuItem::with_id(h, "document.open", "打开…", true, Some("CmdOrCtrl+O"))?;
    let save = MenuItem::with_id(h, "document.save", "保存", true, Some("CmdOrCtrl+S"))?;
    let save_as = MenuItem::with_id(
        h,
        "document.saveAs",
        "另存为…",
        true,
        Some("CmdOrCtrl+Shift+S"),
    )?;
    let close = MenuItem::with_id(h, "document.close", "关闭文档", true, Some("CmdOrCtrl+W"))?;
    let quit = MenuItem::with_id(h, "quit", "退出 WTypora", true, Some("CmdOrCtrl+Q"))?;
    let app_menu = Submenu::with_items(
        h,
        "WTypora",
        true,
        &[
            &PredefinedMenuItem::about(h, Some("关于 WTypora"), None)?,
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
            &save,
            &save_as,
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
            let _ = w.emit("document-command", id);
        }
    });
    Ok(())
}
