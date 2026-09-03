use crate::{
    error::{NativeError, NativeResult},
    state::AccessState,
};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct WatchState {
    watchers: Mutex<HashMap<String, RecommendedWatcher>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FileChangedPayload {
    path: String,
}

pub fn watch_file_impl<F>(path: &Path, on_change: F) -> NativeResult<RecommendedWatcher>
where
    F: Fn(PathBuf) + Send + 'static,
{
    let watched = path
        .canonicalize()
        .map_err(|error| NativeError::io(error, path))?;
    let parent = watched.parent().ok_or_else(|| {
        NativeError::new("invalid_path", "Watched file has no parent directory").at(&watched)
    })?;
    let watched_for_callback = watched.clone();
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        let Ok(event) = result else { return };
        if !matches!(
            event.kind,
            EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
        ) {
            return;
        }
        if event.paths.iter().any(|path| path == &watched_for_callback) {
            on_change(watched_for_callback.clone());
        }
    })
    .map_err(|error| NativeError::new("watch_error", error.to_string()).at(&watched))?;
    watcher
        .watch(parent, RecursiveMode::NonRecursive)
        .map_err(|error| NativeError::new("watch_error", error.to_string()).at(parent))?;
    Ok(watcher)
}

#[tauri::command]
pub fn start_file_watch(
    app: AppHandle,
    access: State<'_, AccessState>,
    watches: State<'_, WatchState>,
    path: String,
) -> NativeResult<String> {
    let path = access.resolve_allowed(&path)?;
    let id = path.to_string_lossy().into_owned();
    let app_for_callback = app.clone();
    let watcher = watch_file_impl(&path, move |changed| {
        let _ = app_for_callback.emit(
            "file-changed",
            FileChangedPayload {
                path: changed.to_string_lossy().into_owned(),
            },
        );
    })?;
    watches
        .watchers
        .lock()
        .expect("file watchers poisoned")
        .insert(id.clone(), watcher);
    Ok(id)
}

#[tauri::command]
pub fn stop_file_watch(watches: State<'_, WatchState>, path: String) {
    watches
        .watchers
        .lock()
        .expect("file watchers poisoned")
        .remove(&path);
}
