use serde::{Deserialize, Serialize};
use std::{
    fs::File,
    io::{Read, Write},
    path::{Path, PathBuf},
    time::Duration,
};
use tauri::WebviewWindow;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Docx,
    Pdf,
}
impl ExportFormat {
    fn extension(self) -> &'static str {
        match self {
            Self::Docx => "docx",
            Self::Pdf => "pdf",
        }
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    format: ExportFormat,
    name: String,
    source_path: Option<PathBuf>,
    bytes: Option<Vec<u8>>,
}

fn source_directory(source_path: Option<&Path>) -> Option<&Path> {
    source_path
        .and_then(Path::parent)
        .filter(|dir| dir.is_dir())
}

fn destination(path: &Path, format: ExportFormat) -> Result<PathBuf, String> {
    let mut path = path.to_path_buf();
    if path.extension().is_none() {
        path.set_extension(format.extension());
    }
    if !path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case(format.extension()))
    {
        return Err(format!("请使用 .{} 文件扩展名。", format.extension()));
    }
    if path.is_symlink() {
        return Err("不能覆盖符号链接，请选择其他文件名。".into());
    }
    Ok(path)
}

fn persist(file: tempfile::NamedTempFile, path: &Path, format: ExportFormat) -> Result<(), String> {
    let mut signature = [0; 5];
    // The native PDF writer may replace the temporary inode, so validate and
    // sync the current path instead of the original NamedTempFile handle.
    let mut exported = File::open(file.path()).map_err(|e| format!("导出文件不完整：{e}"))?;
    exported
        .read_exact(&mut signature)
        .map_err(|e| format!("导出文件不完整：{e}"))?;
    let valid = match format {
        ExportFormat::Docx => signature.starts_with(b"PK\x03\x04"),
        ExportFormat::Pdf => &signature == b"%PDF-",
    };
    if !valid {
        return Err("导出文件格式校验失败，原有文件未被替换。".into());
    }
    exported
        .sync_all()
        .map_err(|e| format!("无法写入导出文件：{e}"))?;
    file.persist(path)
        .map_err(|e| format!("无法保存导出文件：{}", e.error))?;
    Ok(())
}

#[tauri::command]
pub async fn export_document(
    window: WebviewWindow,
    request: ExportRequest,
) -> Result<Option<String>, String> {
    #[cfg(not(target_os = "macos"))]
    if matches!(request.format, ExportFormat::Pdf) {
        return Err("PDF 导出目前支持 macOS。".into());
    }
    if request
        .bytes
        .as_ref()
        .is_some_and(|bytes| bytes.len() > 100 * 1024 * 1024)
    {
        return Err("导出文件超过 100 MB，请减少图片后重试。".into());
    }
    // The native save panel handles explicit overwrite confirmation.
    let mut dialog = rfd::AsyncFileDialog::new()
        .set_parent(&window)
        .set_title(match request.format {
            ExportFormat::Docx => "导出 Word 文档",
            ExportFormat::Pdf => "导出 PDF",
        })
        .set_file_name(&request.name)
        .add_filter(request.format.extension(), &[request.format.extension()]);
    if let Some(directory) = source_directory(request.source_path.as_deref()) {
        dialog = dialog.set_directory(directory);
    }
    let Some(handle) = dialog.save_file().await else {
        return Ok(None);
    };
    let path = destination(handle.path(), request.format)?;
    let parent = path.parent().ok_or("导出目录无效")?;
    let mut file = tempfile::Builder::new()
        .prefix(".wtypora-export-")
        .suffix(&format!(".{}", request.format.extension()))
        .tempfile_in(parent)
        .map_err(|e| format!("无法创建导出文件：{e}"))?;
    match request.format {
        ExportFormat::Docx => {
            let bytes = request.bytes.ok_or("缺少 Word 文档内容")?;
            file.write_all(&bytes)
                .map_err(|e| format!("无法写入 Word 文档：{e}"))?;
        }
        ExportFormat::Pdf => print_pdf(&window, file.path().to_owned()).await?,
    }
    let result_path = path.to_string_lossy().into_owned();
    tauri::async_runtime::spawn_blocking(move || persist(file, &path, request.format))
        .await
        .map_err(|e| e.to_string())??;
    Ok(Some(result_path))
}

#[cfg(target_os = "macos")]
async fn print_pdf(window: &WebviewWindow, path: PathBuf) -> Result<(), String> {
    use std::sync::atomic::{AtomicBool, Ordering};
    static PRINTING: AtomicBool = AtomicBool::new(false);
    if PRINTING.swap(true, Ordering::SeqCst) {
        return Err("另一个窗口正在导出 PDF，请稍后重试。".into());
    }
    struct PrintGuard;
    impl Drop for PrintGuard {
        fn drop(&mut self) {
            PRINTING.store(false, Ordering::SeqCst);
        }
    }
    let _guard = PrintGuard;
    let (send, receive) = std::sync::mpsc::channel();
    window
        .with_webview(move |webview| {
            crate::pdf::start(webview, &path, send);
        })
        .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || receive.recv())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?
}

#[cfg(not(target_os = "macos"))]
async fn print_pdf(_window: &WebviewWindow, _path: PathBuf) -> Result<(), String> {
    Err("PDF 导出目前支持 macOS。".into())
}

fn reveal_target(path: &Path) -> Result<(), String> {
    if path.is_file() {
        Ok(())
    } else {
        Err("无法找到导出的文件。".into())
    }
}

#[tauri::command]
pub async fn reveal_in_folder(path: String) -> Result<(), String> {
    reveal_target(Path::new(&path))?;
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(move || {
            let full_path = objc2_foundation::NSString::from_str(&path);
            objc2_app_kit::NSWorkspace::sharedWorkspace().selectFile_inFileViewerRootedAtPath(
                Some(&full_path),
                &objc2_foundation::NSString::new(),
            );
        })
        .await
        .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("当前平台暂不支持打开所在文件夹。".into())
    }
}

#[derive(Serialize)]
pub struct ExportImage {
    bytes: Vec<u8>,
    mime: String,
}
fn image_url(url: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(url).map_err(|_| "无效图片链接")?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("仅支持不含账号信息的 HTTP(S) 图片链接。".into());
    }
    Ok(url)
}
#[tauri::command]
pub async fn export_image(url: String) -> Result<ExportImage, String> {
    let url = image_url(&url)?;
    tauri::async_runtime::spawn_blocking(move || {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()
            .map_err(|e| e.to_string())?;
        let response = client
            .get(url)
            .send()
            .and_then(|r| r.error_for_status())
            .map_err(|e| e.to_string())?;
        let mime = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .split(';')
            .next()
            .unwrap_or("")
            .trim()
            .to_lowercase();
        if !matches!(
            mime.as_str(),
            "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/bmp"
        ) {
            return Err("不支持的图片格式。".into());
        }
        let mut bytes = Vec::new();
        response
            .take(10 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() > 10 * 1024 * 1024 {
            return Err("图片超过 10 MB。".into());
        }
        Ok(ExportImage { bytes, mime })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn save_panel_uses_source_parent_and_falls_back_for_missing_directories() {
        let dir = tempfile::tempdir().unwrap();
        let parent = dir.path().join("中文 文件夹");
        std::fs::create_dir(&parent).unwrap();
        for format in ["pdf", "docx"] {
            let request: ExportRequest = serde_json::from_value(serde_json::json!({
                "format": format,
                "name": format!("周报.v2.{format}"),
                "sourcePath": parent.join("周报.v2.MARKDOWN"),
            }))
            .unwrap();
            assert_eq!(
                source_directory(request.source_path.as_deref()),
                Some(parent.as_path())
            );
        }
        assert_eq!(source_directory(None), None);
        assert_eq!(
            source_directory(Some(&dir.path().join("missing/note.md"))),
            None
        );
    }

    #[test]
    fn export_paths_cannot_overwrite_markdown_or_follow_symlinks() {
        assert!(destination(Path::new("note.md"), ExportFormat::Pdf).is_err());
        assert_eq!(
            destination(Path::new("中文"), ExportFormat::Docx).unwrap(),
            Path::new("中文.docx")
        );
        assert_eq!(
            destination(Path::new("note.PDF"), ExportFormat::Pdf).unwrap(),
            Path::new("note.PDF")
        );
        #[cfg(unix)]
        {
            let dir = tempfile::tempdir().unwrap();
            let link = dir.path().join("note.pdf");
            std::os::unix::fs::symlink("note.md", &link).unwrap();
            assert!(destination(&link, ExportFormat::Pdf).is_err());
        }
    }
    #[test]
    fn failed_output_keeps_existing_file_and_success_replaces_atomically() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("existing.pdf");
        std::fs::write(&path, b"original").unwrap();
        let file = tempfile::NamedTempFile::new_in(dir.path()).unwrap();
        assert!(persist(file, &path, ExportFormat::Pdf).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"original");
        let mut file = tempfile::NamedTempFile::new_in(dir.path()).unwrap();
        file.write_all(b"%PDF-1.7\nexported").unwrap();
        persist(file, &path, ExportFormat::Pdf).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"%PDF-1.7\nexported");
    }
    #[test]
    fn reveal_requires_an_existing_file() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("导出的报告.pdf");
        assert!(reveal_target(&file).is_err());
        std::fs::write(&file, b"%PDF-1.7\nexported").unwrap();
        assert!(reveal_target(&file).is_ok());
        assert!(reveal_target(dir.path()).is_err());
    }
    #[test]
    fn image_fetch_rejects_local_files_and_embedded_credentials() {
        for url in [
            "file:///etc/passwd",
            "data:image/png;base64,abc",
            "https://user:secret@example.com/image.png",
        ] {
            assert!(image_url(url).is_err());
        }
        assert!(image_url("https://example.com/image.png").is_ok());
    }
}
