pub mod files;
pub mod images;
pub mod watcher;
pub mod workspace;

use crate::{
    error::{NativeError, NativeResult},
    state::AccessState,
};
use std::path::PathBuf;
use tauri::{State, Window};
use tauri_plugin_dialog::{DialogExt, FilePath};

fn local_path(path: FilePath) -> NativeResult<PathBuf> {
    path.into_path()
        .map_err(|error| NativeError::new("invalid_path", error.to_string()))
}

#[tauri::command]
pub async fn open_text_file(
    window: Window,
    state: State<'_, AccessState>,
) -> NativeResult<Option<files::FileSnapshot>> {
    let selected = window
        .dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown", "txt"])
        .blocking_pick_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = local_path(selected)?;
    state.grant_file(&path)?;
    files::read_text_file_impl(&state, &path).map(Some)
}

#[tauri::command]
pub async fn choose_workspace(
    window: Window,
    state: State<'_, AccessState>,
) -> NativeResult<Option<workspace::WorkspaceSnapshot>> {
    let selected = window.dialog().file().blocking_pick_folder();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = local_path(selected)?;
    let path = state.grant_directory(&path)?;
    Ok(Some(workspace::WorkspaceSnapshot {
        path: path.to_string_lossy().into_owned(),
        entries: workspace::scan_workspace_impl(&state, &path)?,
    }))
}

#[tauri::command]
pub async fn save_text_file_as(
    window: Window,
    state: State<'_, AccessState>,
    markdown: String,
    suggested_name: String,
) -> NativeResult<Option<files::FileWriteResult>> {
    let selected = window
        .dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown", "txt"])
        .set_file_name(suggested_name)
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = local_path(selected)?;
    state.grant_file(&path)?;
    files::write_text_file_atomic_impl(&state, &path, &markdown).map(Some)
}

#[tauri::command]
pub async fn save_export_file_as(
    window: Window,
    state: State<'_, AccessState>,
    html: String,
    suggested_name: String,
) -> NativeResult<Option<String>> {
    let selected = window
        .dialog()
        .file()
        .add_filter("HTML", &["html"])
        .set_file_name(suggested_name)
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = local_path(selected)?;
    state.grant_file(&path)?;
    files::write_text_file_atomic_impl(&state, &path, &html)?;
    Ok(Some(path.to_string_lossy().into_owned()))
}
