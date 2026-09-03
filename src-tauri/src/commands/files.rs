use crate::{
    error::{NativeError, NativeResult},
    state::AccessState,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::State;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSnapshot {
    pub path: String,
    pub name: String,
    pub markdown: String,
    pub modified_at: u64,
    pub digest: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileWriteResult {
    pub path: String,
    pub modified_at: u64,
    pub digest: String,
}

fn digest(contents: &str) -> String {
    format!("{:x}", Sha256::digest(contents.as_bytes()))
}

fn modified_at(path: &Path) -> NativeResult<u64> {
    let time = fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .map_err(|error| NativeError::io(error, path))?;
    Ok(time
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64)
}

pub fn read_text_file_impl(state: &AccessState, path: &Path) -> NativeResult<FileSnapshot> {
    let path = state.resolve_allowed(path)?;
    let markdown = fs::read_to_string(&path).map_err(|error| NativeError::io(error, &path))?;
    Ok(FileSnapshot {
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        path: path.to_string_lossy().into_owned(),
        modified_at: modified_at(&path)?,
        digest: digest(&markdown),
        markdown,
    })
}

pub fn write_text_file_atomic_impl(
    state: &AccessState,
    path: &Path,
    markdown: &str,
) -> NativeResult<FileWriteResult> {
    let path = state.resolve_allowed(path)?;
    let parent = path.parent().ok_or_else(|| {
        NativeError::new("invalid_path", "Destination has no parent directory").at(&path)
    })?;
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = parent.join(format!(".wtypora-{}-{unique}.tmp", std::process::id()));

    let result = (|| -> NativeResult<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| NativeError::io(error, &temporary))?;
        file.write_all(markdown.as_bytes())
            .map_err(|error| NativeError::io(error, &temporary))?;
        file.sync_all()
            .map_err(|error| NativeError::io(error, &temporary))?;
        drop(file);
        fs::rename(&temporary, &path).map_err(|error| NativeError::io(error, &path))?;
        Ok(())
    })();

    if result.is_err() && temporary.exists() {
        let _ = fs::remove_file(&temporary);
    }
    result?;

    Ok(FileWriteResult {
        path: path.to_string_lossy().into_owned(),
        modified_at: modified_at(&path)?,
        digest: digest(markdown),
    })
}

#[tauri::command]
pub fn read_text_file(
    state: State<'_, AccessState>,
    path: String,
) -> NativeResult<FileSnapshot> {
    read_text_file_impl(&state, Path::new(&path))
}

#[tauri::command]
pub fn write_text_file_atomic(
    state: State<'_, AccessState>,
    path: String,
    markdown: String,
) -> NativeResult<FileWriteResult> {
    write_text_file_atomic_impl(&state, Path::new(&path), &markdown)
}

#[tauri::command]
pub fn write_export_file(
    state: State<'_, AccessState>,
    path: String,
    html: String,
) -> NativeResult<FileWriteResult> {
    write_text_file_atomic_impl(&state, Path::new(&path), &html)
}
