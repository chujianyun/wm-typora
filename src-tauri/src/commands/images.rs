use crate::{
    error::{NativeError, NativeResult},
    state::AccessState,
};
use serde::Serialize;
use std::{
    fs::{self, File, OpenOptions},
    io::{self, ErrorKind, Write},
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager, State};

const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopiedImage {
    pub absolute_path: PathBuf,
    pub relative_path: String,
}

fn create_image_destination(
    document: &Path,
    source_name: &Path,
) -> NativeResult<(File, PathBuf, String)> {
    if !supported_image(source_name) {
        return Err(NativeError::new(
            "unsupported_image",
            "Supported image types are PNG, JPEG, GIF, WebP, BMP, SVG and AVIF",
        )
        .at(source_name));
    }
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
    let assets = assets
        .canonicalize()
        .map_err(|error| NativeError::io(error, &assets))?;
    if !assets.starts_with(parent) {
        return Err(NativeError::new(
            "image_not_allowed",
            "The document asset directory cannot point outside the document directory",
        )
        .at(&assets));
    }
    let file_stem = source_name
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("image");
    let extension = source_name.extension().and_then(|value| value.to_str());
    let mut index = 1;
    loop {
        let name = match (index, extension) {
            (1, _) => source_name.to_string_lossy().into_owned(),
            (_, Some(extension)) => format!("{file_stem}-{index}.{extension}"),
            (_, None) => format!("{file_stem}-{index}"),
        };
        let candidate = assets.join(name);
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => return Ok((file, candidate, assets_name)),
            Err(error) if error.kind() == ErrorKind::AlreadyExists => index += 1,
            Err(error) => return Err(NativeError::io(error, &candidate)),
        }
    }
}

fn supported_image(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| {
            IMAGE_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str())
        })
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
    let (mut destination, candidate, assets_name) =
        create_image_destination(&document, Path::new(source_name))?;
    let result = (|| -> io::Result<()> {
        let mut source = File::open(&source)?;
        io::copy(&mut source, &mut destination)?;
        destination.sync_all()
    })();
    if let Err(error) = result {
        drop(destination);
        let _ = fs::remove_file(&candidate);
        return Err(NativeError::io(error, &candidate));
    }
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
    let (mut destination, candidate, assets_name) =
        create_image_destination(&document, Path::new(safe_name))?;
    let result = destination
        .write_all(bytes)
        .and_then(|_| destination.sync_all());
    if let Err(error) = result {
        drop(destination);
        let _ = fs::remove_file(&candidate);
        return Err(NativeError::io(error, &candidate));
    }
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

pub fn resolve_image_asset_impl(
    state: &AccessState,
    document: &Path,
    image: &Path,
) -> NativeResult<PathBuf> {
    let document = state.resolve_allowed(document)?;
    let parent = document.parent().ok_or_else(|| {
        NativeError::new("invalid_path", "Document has no parent directory").at(&document)
    })?;
    let stem = document
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("document");
    let assets = parent.join(format!("{stem}.assets"));
    let assets = assets
        .canonicalize()
        .map_err(|error| NativeError::io(error, &assets))?;
    if !assets.starts_with(parent) {
        return Err(NativeError::new(
            "image_not_allowed",
            "The document asset directory cannot point outside the document directory",
        )
        .at(&assets));
    }
    let image = image
        .canonicalize()
        .map_err(|error| NativeError::io(error, image))?;
    if !image.starts_with(&assets) || !image.is_file() || !supported_image(&image) {
        return Err(NativeError::new(
            "image_not_allowed",
            "Only supported images in this document's asset directory can be displayed",
        )
        .at(&image));
    }
    Ok(image)
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

#[tauri::command]
pub fn resolve_image_asset(
    app: AppHandle,
    state: State<'_, AccessState>,
    document_path: String,
    image_path: String,
) -> NativeResult<String> {
    let path = resolve_image_asset_impl(&state, Path::new(&document_path), Path::new(&image_path))?;
    app.asset_protocol_scope()
        .allow_file(&path)
        .map_err(|error| NativeError::new("asset_scope_error", error.to_string()).at(&path))?;
    Ok(path.to_string_lossy().into_owned())
}
