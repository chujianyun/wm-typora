use crate::{
    error::{NativeError, NativeResult},
    state::AccessState,
};
use serde::Serialize;
use std::{fs, path::Path};
use tauri::State;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceEntry {
    pub name: String,
    pub path: String,
    pub kind: &'static str,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<WorkspaceEntry>,
}

fn ignored_directory(name: &str) -> bool {
    name.starts_with('.') || matches!(name, "node_modules" | "dist" | "build" | "target" | ".git")
}

fn supported_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "md" | "markdown" | "txt"
            )
        })
}

fn scan(directory: &Path) -> NativeResult<Vec<WorkspaceEntry>> {
    let mut files = Vec::new();
    let mut directories = Vec::new();
    for entry in fs::read_dir(directory).map_err(|error| NativeError::io(error, directory))? {
        let entry = entry.map_err(|error| NativeError::io(error, directory))?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        let file_type = entry
            .file_type()
            .map_err(|error| NativeError::io(error, &path))?;
        if file_type.is_symlink() || name.starts_with('.') {
            continue;
        }
        if file_type.is_file() && supported_file(&path) {
            files.push(WorkspaceEntry {
                name,
                path: path.to_string_lossy().into_owned(),
                kind: "file",
                children: Vec::new(),
            });
        } else if file_type.is_dir() && !ignored_directory(&name) {
            let children = scan(&path)?;
            if !children.is_empty() {
                directories.push(WorkspaceEntry {
                    name,
                    path: path.to_string_lossy().into_owned(),
                    kind: "directory",
                    children,
                });
            }
        }
    }
    files.sort_by_key(|left| left.name.to_lowercase());
    directories.sort_by_key(|left| left.name.to_lowercase());
    files.extend(directories);
    Ok(files)
}

pub fn scan_workspace_impl(state: &AccessState, path: &Path) -> NativeResult<Vec<WorkspaceEntry>> {
    let path = state.resolve_allowed(path)?;
    scan(&path)
}

#[tauri::command]
pub fn scan_workspace(
    state: State<'_, AccessState>,
    path: String,
) -> NativeResult<Vec<WorkspaceEntry>> {
    scan_workspace_impl(&state, Path::new(&path))
}
