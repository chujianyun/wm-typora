use crate::{
    error::{NativeError, NativeResult},
    state::AccessState,
};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::State;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopiedImage {
    pub absolute_path: PathBuf,
    pub relative_path: String,
}

fn image_destination(document: &Path, source_name: &Path) -> NativeResult<(PathBuf, String)> {
    let parent = document.parent().ok_or_else(|| {
        NativeError::new("invalid_path", "Document has no parent directory").at(document)
    })?;
    let stem = document
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("document");
    let assets_name = format!("{stem}.assets");
    let assets = parent.join(&assets_name);
    fs::create_dir_all(&assets).map_err(|error| NativeError::io(error, &assets))?;
    let file_stem = source_name
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("image");
    let extension = source_name.extension().and_then(|value| value.to_str());
    let mut candidate = assets.join(source_name);
    let mut index = 2;
    while candidate.exists() {
        let name = match extension {
            Some(extension) => format!("{file_stem}-{index}.{extension}"),
            None => format!("{file_stem}-{index}"),
        };
        candidate = assets.join(name);
        index += 1;
    }
    Ok((candidate, assets_name))
}

pub fn copy_image_impl(
    state: &AccessState,
    source: &Path,
    document: &Path,
) -> NativeResult<CopiedImage> {
    let source = state.resolve_allowed(source)?;
    let document = state.resolve_allowed(document)?;
    let source_name = source
        .file_name()
        .ok_or_else(|| NativeError::new("invalid_image", "Image has no file name").at(&source))?;
    let (candidate, assets_name) = image_destination(&document, Path::new(source_name))?;

    fs::copy(&source, &candidate).map_err(|error| NativeError::io(error, &candidate))?;
    let relative_name = candidate
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    Ok(CopiedImage {
        absolute_path: candidate,
        relative_path: format!("{assets_name}/{relative_name}"),
    })
}

pub fn store_image_impl(
    state: &AccessState,
    file_name: &str,
    bytes: &[u8],
    document: &Path,
) -> NativeResult<CopiedImage> {
    let document = state.resolve_allowed(document)?;
    let safe_name = Path::new(file_name)
        .file_name()
        .ok_or_else(|| NativeError::new("invalid_image", "Image has no file name"))?;
    let (candidate, assets_name) = image_destination(&document, Path::new(safe_name))?;
    fs::write(&candidate, bytes).map_err(|error| NativeError::io(error, &candidate))?;
    let relative_name = candidate
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    Ok(CopiedImage {
        absolute_path: candidate,
        relative_path: format!("{assets_name}/{relative_name}"),
    })
}

#[tauri::command]
pub fn copy_image(
    state: State<'_, AccessState>,
    source_path: String,
    document_path: String,
) -> NativeResult<CopiedImage> {
    copy_image_impl(&state, Path::new(&source_path), Path::new(&document_path))
}

#[tauri::command]
pub fn store_image(
    state: State<'_, AccessState>,
    file_name: String,
    bytes: Vec<u8>,
    document_path: String,
) -> NativeResult<CopiedImage> {
    store_image_impl(&state, &file_name, &bytes, Path::new(&document_path))
}
