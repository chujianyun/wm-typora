pub mod commands;
pub mod error;
pub mod state;

use commands::watcher::WatchState;
use state::AccessState;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    App, Emitter, Runtime,
};

fn command_item<R: Runtime>(
    app: &App<R>,
    id: &str,
    label: &str,
    accelerator: Option<&str>,
) -> tauri::Result<tauri::menu::MenuItem<R>> {
    let item = MenuItemBuilder::with_id(id, label);
    match accelerator {
        Some(accelerator) => item.accelerator(accelerator).build(app),
        None => item.build(app),
    }
}

fn install_menu<R: Runtime>(app: &mut App<R>) -> tauri::Result<()> {
    let new = command_item(app, "new-document", "新建", Some("CmdOrCtrl+N"))?;
    let open = command_item(app, "open-file", "打开…", Some("CmdOrCtrl+O"))?;
    let workspace = command_item(app, "open-workspace", "打开文件夹…", None)?;
    let save = command_item(app, "save-document", "保存", Some("CmdOrCtrl+S"))?;
    let save_as = command_item(app, "save-as", "另存为…", Some("CmdOrCtrl+Shift+S"))?;
    let export = command_item(app, "export-html", "导出 HTML…", None)?;
    let print = command_item(app, "print-document", "打印 / PDF…", Some("CmdOrCtrl+P"))?;
    let find = command_item(app, "find", "查找与替换", Some("CmdOrCtrl+F"))?;
    let sidebar = command_item(app, "toggle-sidebar", "切换侧栏", Some("CmdOrCtrl+Shift+L"))?;
    let source = command_item(
        app,
        "toggle-source",
        "切换源码模式",
        Some("CmdOrCtrl+Shift+M"),
    )?;
    let focus = command_item(
        app,
        "toggle-focus",
        "切换专注模式",
        Some("CmdOrCtrl+Shift+D"),
    )?;
    let typewriter = command_item(
        app,
        "toggle-typewriter",
        "切换打字机模式",
        Some("CmdOrCtrl+Shift+T"),
    )?;
    let quit = command_item(app, "quit-application", "退出 WTypora", Some("CmdOrCtrl+Q"))?;

    let app_menu = SubmenuBuilder::new(app, "WTypora")
        .about(None)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .item(&quit)
        .build()?;
    let file_menu = SubmenuBuilder::new(app, "文件")
        .items(&[&new, &open, &workspace])
        .separator()
        .items(&[&save, &save_as])
        .separator()
        .items(&[&export, &print])
        .build()?;
    let edit_menu = SubmenuBuilder::new(app, "编辑")
        .undo_with_text("撤销")
        .redo_with_text("重做")
        .separator()
        .cut_with_text("剪切")
        .copy_with_text("复制")
        .paste_with_text("粘贴")
        .select_all_with_text("全选")
        .separator()
        .item(&find)
        .build()?;
    let view_menu = SubmenuBuilder::new(app, "视图")
        .items(&[&sidebar, &source, &focus, &typewriter])
        .build()?;
    let window_menu = SubmenuBuilder::new(app, "窗口")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;
    let menu = MenuBuilder::new(app)
        .items(&[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu])
        .build()?;
    app.set_menu(menu)?;
    app.on_menu_event(|handle, event| {
        let _ = handle.emit("menu-command", event.id().as_ref());
    });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AccessState::default())
        .manage(WatchState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            install_menu(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::open_text_file,
            commands::choose_workspace,
            commands::save_text_file_as,
            commands::save_export_file_as,
            commands::files::read_text_file,
            commands::files::write_text_file_atomic,
            commands::files::write_export_file,
            commands::workspace::scan_workspace,
            commands::images::copy_image,
            commands::images::store_image,
            commands::images::resolve_image_asset,
            commands::watcher::start_file_watch,
            commands::watcher::stop_file_watch,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run WTypora");
}
