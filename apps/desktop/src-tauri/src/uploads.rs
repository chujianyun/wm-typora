use reqwest::{Url, blocking::Client, redirect::Policy};
use serde::{Deserialize, Serialize};
use std::{
    io::{Read, Write},
    process::{Command, Stdio},
    time::{Duration, Instant},
};

#[derive(Deserialize)]
pub struct UploadSettings {
    provider: String,
    endpoint: String,
    executable: String,
}
#[derive(Deserialize)]
struct PicGoReply {
    success: bool,
    result: Option<Vec<String>>,
}
#[derive(Serialize)]
struct PicGoRequest {
    list: Vec<String>,
}

fn image_suffix(mime: &str) -> Result<&'static str, String> {
    match mime {
        "image/png" => Ok(".png"),
        "image/jpeg" => Ok(".jpg"),
        "image/gif" => Ok(".gif"),
        "image/webp" => Ok(".webp"),
        "image/bmp" => Ok(".bmp"),
        _ => Err("不支持的图片格式".into()),
    }
}
fn local_endpoint(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "PicGo 服务地址无效")?;
    if url.scheme() != "http"
        || !matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"))
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(
            "PicGo 服务地址必须是本机 HTTP 地址，例如 http://127.0.0.1:36677/upload".into(),
        );
    }
    Ok(url)
}
fn image_url(value: &str) -> Result<String, String> {
    let url = Url::parse(value).map_err(|_| "图床返回了无效链接")?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("图床返回了无效链接".into());
    }
    Ok(url.to_string())
}
fn core_result(output: &str) -> Result<String, String> {
    output
        .lines()
        .rev()
        .find_map(|line| image_url(line.trim()).ok())
        .ok_or("PicGo-Core 未返回图片链接，请检查图床配置和上传日志。".into())
}
fn core_command(executable: &str) -> Result<Command, String> {
    let mut paths = Vec::new();
    // npm launchers use /usr/bin/env node. An absolute PicGo path alone does
    // not let Finder-launched apps discover its sibling Node executable.
    if let Some(parent) = std::path::Path::new(executable)
        .parent()
        .filter(|path| path.is_absolute())
    {
        paths.push(parent.to_path_buf());
    }
    if let Some(inherited) = std::env::var_os("PATH") {
        paths.extend(std::env::split_paths(&inherited));
    }
    #[cfg(target_os = "macos")]
    for directory in ["/opt/homebrew/bin", "/usr/local/bin"] {
        let path = std::path::PathBuf::from(directory);
        if !paths.contains(&path) {
            paths.push(path);
        }
    }
    let path = std::env::join_paths(paths).map_err(|_| "无法构建 PicGo-Core 程序搜索路径")?;
    let mut command = Command::new(executable);
    // Scope PATH to this child; do not mutate the app environment or run a shell.
    command.env("PATH", path);
    Ok(command)
}
fn upload(bytes: Vec<u8>, mime: String, settings: UploadSettings) -> Result<String, String> {
    if bytes.is_empty() || bytes.len() > 10 * 1024 * 1024 {
        return Err("图片为空或超过 10 MB".into());
    }
    let suffix = image_suffix(&mime)?;
    let mut file = tempfile::Builder::new()
        .prefix("wtypora-upload-")
        .suffix(suffix)
        .tempfile()
        .map_err(|_| "无法创建图片临时文件")?;
    file.write_all(&bytes).map_err(|_| "无法写入图片临时文件")?;
    file.flush().map_err(|_| "无法写入图片临时文件")?;
    match settings.provider.as_str() {
        "picgo" => {
            let endpoint = local_endpoint(&settings.endpoint)?;
            let client = Client::builder()
                .no_proxy()
                .redirect(Policy::none())
                .connect_timeout(Duration::from_secs(3))
                .timeout(Duration::from_secs(60))
                .build()
                .map_err(|_| "无法连接 PicGo")?;
            let response = client
                .post(endpoint)
                .json(&PicGoRequest {
                    list: vec![file.path().to_string_lossy().into_owned()],
                })
                .send()
                .map_err(|_| "PicGo 未响应，请启动 PicGo 并开启 Server，检查服务地址后重新粘贴。")?
                .error_for_status()
                .map_err(|_| "PicGo 上传服务返回错误，请检查图床配置。")?;
            let mut data = String::new();
            response
                .take(64 * 1024)
                .read_to_string(&mut data)
                .map_err(|_| "无法读取 PicGo 返回结果")?;
            let reply: PicGoReply =
                serde_json::from_str(&data).map_err(|_| "PicGo 返回结果格式无效")?;
            if !reply.success {
                return Err("PicGo 上传失败，请检查图床配置或 PicGo 上传日志。".into());
            }
            image_url(
                reply
                    .result
                    .as_ref()
                    .and_then(|list| list.first())
                    .ok_or("PicGo 未返回图片链接")?,
            )
        }
        "picgo-core" => {
            let executable = settings.executable.trim();
            if executable.is_empty() {
                return Err("请填写 PicGo-Core 程序路径".into());
            }
            // Use an argument vector, never a shell command. Capture output in a file to
            // avoid pipe-buffer deadlocks; kill the child before removing upload files.
            let output = tempfile::tempfile().map_err(|_| "无法创建上传日志")?;
            let mut child = core_command(executable)?
                .arg("upload")
                .arg(file.path())
                .stdin(Stdio::null())
                .stdout(output.try_clone().map_err(|_| "无法创建上传日志")?)
                .stderr(Stdio::null())
                .spawn()
                .map_err(|_| "无法启动 PicGo-Core，请检查可执行文件路径。")?;
            let started = Instant::now();
            loop {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        if !status.success() {
                            return Err(format!(
                                "PicGo-Core 进程退出（{status}）。请检查 Node.js 运行环境和 PicGo 上传日志。"
                            ));
                        }
                        break;
                    }
                    Ok(None) if started.elapsed() < Duration::from_secs(60) => {
                        std::thread::sleep(Duration::from_millis(100))
                    }
                    _ => {
                        let _ = child.kill();
                        let _ = child.wait();
                        return Err("PicGo-Core 上传超时或进程异常，请重试。".into());
                    }
                }
            }
            use std::io::{Seek, SeekFrom};
            let mut output = output;
            output
                .seek(SeekFrom::Start(0))
                .map_err(|_| "无法读取上传结果")?;
            let mut text = String::new();
            output
                .take(1024 * 1024)
                .read_to_string(&mut text)
                .map_err(|_| "无法读取上传结果")?;
            core_result(&text)
        }
        _ => Err("请先在设置中选择图床软件".into()),
    }
}
#[tauri::command]
pub async fn upload_image(
    bytes: Vec<u8>,
    mime: String,
    settings: UploadSettings,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || upload(bytes, mime, settings))
        .await
        .map_err(|_| "图片上传任务失败")?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_contacts_local_picgo_and_accepts_image_urls() {
        assert!(local_endpoint("http://127.0.0.1:36677/upload").is_ok());
        assert!(local_endpoint("https://example.com/upload").is_err());
        assert!(local_endpoint("http://user:secret@localhost/upload").is_err());
        assert!(image_url("javascript:alert(1)").is_err());
        assert!(image_url("file:///etc/passwd").is_err());
        assert_eq!(
            core_result("[PicGo SUCCESS]:\nhttps://example.com/a.png\n").unwrap(),
            "https://example.com/a.png"
        );
        assert!(core_result("[PicGo ERROR] failed").is_err());
    }
}

#[cfg(test)]
mod transport_tests {
    use super::*;
    use std::{
        io::{BufRead, BufReader},
        net::TcpListener,
    };
    fn mock_upload(response: &str) -> (Result<String, String>, std::path::PathBuf) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let endpoint = format!("http://{}/upload", listener.local_addr().unwrap());
        let response = response.to_string();
        let server = std::thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut reader = BufReader::new(stream);
            let mut line = String::new();
            reader.read_line(&mut line).unwrap();
            assert_eq!(line.trim(), "POST /upload HTTP/1.1");
            let mut size = 0;
            loop {
                line.clear();
                reader.read_line(&mut line).unwrap();
                if line == "\r\n" {
                    break;
                }
                if let Some(value) = line.to_lowercase().strip_prefix("content-length:") {
                    size = value.trim().parse().unwrap();
                }
            }
            let mut body = vec![0; size];
            reader.read_exact(&mut body).unwrap();
            let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
            let path = std::path::PathBuf::from(json["list"][0].as_str().unwrap());
            assert_eq!(std::fs::read(&path).unwrap(), b"test image bytes");
            let reply = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                response.len(),
                response
            );
            reader.get_mut().write_all(reply.as_bytes()).unwrap();
            path
        });
        let result = upload(
            b"test image bytes".to_vec(),
            "image/png".into(),
            UploadSettings {
                provider: "picgo".into(),
                endpoint,
                executable: "".into(),
            },
        );
        (result, server.join().unwrap())
    }
    #[test]
    fn picgo_receives_the_pasted_file_and_temp_file_is_removed_after_success() {
        let (result, path) =
            mock_upload(r#"{"success":true,"result":["https://example.com/image.png"]}"#);
        assert_eq!(result.unwrap(), "https://example.com/image.png");
        assert!(!path.exists());
    }
    #[test]
    fn failure_and_unsafe_results_do_not_escape_or_leak_temporary_files() {
        for response in [
            r#"{"success":false}"#,
            r#"{"success":true,"result":["file:///etc/passwd"]}"#,
            "invalid json",
        ] {
            let (result, path) = mock_upload(response);
            assert!(result.is_err());
            assert!(!path.exists());
        }
    }
}

#[cfg(all(test, unix))]
mod core_process_tests {
    use super::*;
    use std::{fs, os::unix::fs::PermissionsExt};

    #[test]
    fn core_upload_finds_sibling_runtime_with_finder_path() {
        let dir = tempfile::Builder::new()
            .prefix("wtypora picgo ; ")
            .tempdir()
            .unwrap();
        let executable = dir.path().join("picgo");
        let runtime = dir.path().join("wtypora-test-node");
        fs::write(&executable, "#!/usr/bin/env wtypora-test-node\n").unwrap();
        fs::write(
            &runtime,
            "#!/bin/sh\n[ \"$2\" = upload ] || exit 2\n[ -f \"$3\" ] || exit 3\ncat \"$3\" > \"$WTYPORA_TEST_IMAGE\"\nprintf '%s' \"$3\" > \"$WTYPORA_TEST_TEMP_PATH\"\nprintf '[PicGo SUCCESS]\\nhttps://example.com/image.png\\n'\n",
        )
        .unwrap();
        for path in [&executable, &runtime] {
            fs::set_permissions(path, fs::Permissions::from_mode(0o700)).unwrap();
        }
        let image = dir.path().join("received-image");
        let temp_path = dir.path().join("temp-path");
        // Change only a subprocess environment: parallel tests must not mutate PATH.
        let result = Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "uploads::core_process_tests::core_upload_child",
                "--ignored",
                "--nocapture",
            ])
            .env("PATH", "/usr/bin:/bin:/usr/sbin:/sbin")
            .env("WTYPORA_TEST_PICGO", &executable)
            .env("WTYPORA_TEST_IMAGE", &image)
            .env("WTYPORA_TEST_TEMP_PATH", &temp_path)
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "{}\n{}",
            String::from_utf8_lossy(&result.stdout),
            String::from_utf8_lossy(&result.stderr)
        );
        assert_eq!(fs::read(image).unwrap(), b"test image bytes");
        assert!(!std::path::Path::new(&fs::read_to_string(temp_path).unwrap()).exists());
    }

    #[test]
    #[ignore = "subprocess entry point with an isolated PATH"]
    fn core_upload_child() {
        let result = upload(
            b"test image bytes".to_vec(),
            "image/png".into(),
            UploadSettings {
                provider: "picgo-core".into(),
                endpoint: String::new(),
                executable: std::env::var("WTYPORA_TEST_PICGO").unwrap(),
            },
        );
        assert_eq!(result.unwrap(), "https://example.com/image.png");
    }

    #[test]
    #[ignore = "manual smoke test: requires a locally installed PicGo-Core"]
    fn installed_picgo_starts() {
        let executable = std::env::var("WTYPORA_TEST_PICGO").unwrap();
        let result = core_command(&executable)
            .unwrap()
            .arg("--version")
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
        let version = String::from_utf8_lossy(&result.stdout);
        assert!(!version.trim().is_empty());
        println!("PicGo-Core version: {}", version.trim());
    }
}
