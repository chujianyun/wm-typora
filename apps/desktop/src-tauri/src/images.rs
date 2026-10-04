use reqwest::Url;
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
pub struct LocalImage {
    bytes: Vec<u8>,
    mime: String,
}

const MAX_IMAGE_BYTES: u64 = 20 * 1024 * 1024;

fn image_mime(path: &Path) -> Result<&'static str, String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());
    match extension.as_deref() {
        Some("png") => Ok("image/png"),
        Some("jpg" | "jpeg") => Ok("image/jpeg"),
        Some("gif") => Ok("image/gif"),
        Some("webp") => Ok("image/webp"),
        Some("bmp") => Ok("image/bmp"),
        Some("svg") => Ok("image/svg+xml"),
        Some("ico") => Ok("image/x-icon"),
        Some("avif") => Ok("image/avif"),
        _ => Err("不支持的图片格式".into()),
    }
}

fn resolve_path(source: &str, document_path: Option<&str>) -> Result<PathBuf, String> {
    let source = source.trim();
    if source.is_empty() {
        return Err("图片链接为空".into());
    }
    // The renderer already vets schemes, but the command boundary re-checks:
    // only file: URLs, absolute paths and document-relative paths are read.
    if let Ok(url) = Url::parse(source) {
        if url.scheme() != "file" {
            return Err("仅支持本地图片路径".into());
        }
        return url.to_file_path().map_err(|_| "图片路径无效".to_string());
    }
    if source.starts_with('/') {
        return Url::parse("file:///")
            .and_then(|base| base.join(source))
            .map_err(|_| "图片路径无效".to_string())?
            .to_file_path()
            .map_err(|_| "图片路径无效".to_string());
    }
    let document = document_path.ok_or("相对路径图片需要先保存文档")?;
    let directory = Path::new(document)
        .parent()
        .ok_or("文档路径无效".to_string())?;
    Url::from_directory_path(directory)
        .map_err(|_| "文档路径无效".to_string())?
        .join(source)
        .map_err(|_| "图片路径无效".to_string())?
        .to_file_path()
        .map_err(|_| "图片路径无效".to_string())
}

fn read_local(source: &str, document_path: Option<&str>) -> Result<LocalImage, String> {
    let path = resolve_path(source, document_path)?;
    let mime = image_mime(&path)?;
    let metadata = std::fs::metadata(&path).map_err(|_| "图片文件不存在或无法读取")?;
    if !metadata.is_file() {
        return Err("图片路径不是文件".into());
    }
    if metadata.len() > MAX_IMAGE_BYTES {
        return Err("图片超过 20 MB".into());
    }
    let bytes = std::fs::read(&path).map_err(|_| "图片文件不存在或无法读取")?;
    Ok(LocalImage {
        bytes,
        mime: mime.into(),
    })
}

#[tauri::command]
pub async fn read_local_image(
    source: String,
    document_path: Option<String>,
) -> Result<LocalImage, String> {
    tauri::async_runtime::spawn_blocking(move || read_local(&source, document_path.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_dir() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("pic.png"), [0x89, 0x50, 0x4e, 0x47]).unwrap();
        std::fs::write(dir.path().join("my pic.jpg"), [0xff, 0xd8]).unwrap();
        std::fs::create_dir(dir.path().join("sub")).unwrap();
        std::fs::write(dir.path().join("sub/nested.webp"), [0x52]).unwrap();
        std::fs::write(dir.path().join("notes.txt"), b"text").unwrap();
        dir
    }

    #[test]
    fn resolves_relative_sources_against_the_document_directory() {
        let dir = fixture_dir();
        let document = dir.path().join("note.md");
        let image = read_local("pic.png", document.to_str()).unwrap();
        assert_eq!(image.mime, "image/png");
        assert_eq!(image.bytes, [0x89, 0x50, 0x4e, 0x47]);
        let nested = read_local("sub/nested.webp", document.to_str()).unwrap();
        assert_eq!(nested.mime, "image/webp");
    }

    #[test]
    fn decodes_percent_escaped_sources() {
        let dir = fixture_dir();
        let document = dir.path().join("note.md");
        let image = read_local("my%20pic.jpg", document.to_str()).unwrap();
        assert_eq!(image.mime, "image/jpeg");
    }

    #[test]
    fn reads_absolute_and_file_url_sources_without_a_document() {
        let dir = fixture_dir();
        let absolute = dir.path().join("pic.png");
        let image = read_local(absolute.to_str().unwrap(), None).unwrap();
        assert_eq!(image.mime, "image/png");
        let url = Url::from_file_path(&absolute).unwrap();
        let via_url = read_local(url.as_str(), None).unwrap();
        assert_eq!(via_url.bytes, image.bytes);
    }

    #[test]
    fn rejects_relative_sources_without_a_saved_document() {
        let error = read_local("pic.png", None).unwrap_err();
        assert!(error.contains("保存"));
    }

    #[test]
    fn rejects_missing_files_and_unsupported_formats() {
        let dir = fixture_dir();
        let document = dir.path().join("note.md");
        assert!(read_local("missing.png", document.to_str()).is_err());
        let unsupported = read_local("notes.txt", document.to_str()).unwrap_err();
        assert!(unsupported.contains("格式"));
    }

    #[test]
    fn rejects_non_file_schemes_and_oversized_files() {
        let dir = fixture_dir();
        let document = dir.path().join("note.md");
        assert!(read_local("https://example.com/pic.png", document.to_str()).is_err());
        assert!(read_local("data:image/png;base64,AA==", document.to_str()).is_err());
        let big = dir.path().join("big.png");
        std::fs::write(&big, vec![0u8; MAX_IMAGE_BYTES as usize + 1]).unwrap();
        let error = read_local("big.png", document.to_str()).unwrap_err();
        assert!(error.contains("20 MB"));
    }
}
