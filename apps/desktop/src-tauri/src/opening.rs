use std::{
    collections::HashSet,
    path::{Path, PathBuf},
};
use tauri::DragDropEvent;

pub const DOCUMENT_EXTENSIONS: &[&str] = &["md", "markdown", "mdown", "mkd", "txt"];

pub fn validate_path(path: &Path) -> Result<PathBuf, String> {
    let extension = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !DOCUMENT_EXTENSIONS.contains(&extension.as_str()) {
        return Err("请选择 Markdown 文件（.md、.markdown、.mdown、.mkd）或纯文本文件。".into());
    }
    if !path.is_file() {
        return Err("文件不存在或不是普通文件，请重新选择。".into());
    }
    path.canonicalize()
        .map_err(|e| format!("无法打开文件：{e}"))
}

pub fn handle_drop(
    event: &DragDropEvent,
    mut open: impl FnMut(PathBuf) -> Result<(), String>,
) -> Result<(), String> {
    let DragDropEvent::Drop { paths, .. } = event else {
        return Ok(());
    };
    let mut seen = HashSet::new();
    let mut errors = Vec::new();
    for path in paths {
        let result = validate_path(path).and_then(|canonical| {
            if seen.insert(canonical.clone()) {
                open(canonical)
            } else {
                Ok(())
            }
        });
        if let Err(error) = result {
            errors.push(error);
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("\n"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use wtypora_document_core::Registry;

    #[test]
    fn drop_opens_markdown_without_releasing_the_existing_document() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("拖入 文档.MD");
        fs::write(&path, "# 拖入\n正文").unwrap();
        let registry = Registry::new(dir.path().join("data"));
        let current = registry.create("existing").unwrap();
        let mut loaded = None;
        handle_drop(
            &DragDropEvent::Drop {
                paths: vec![path.clone(), path],
                position: (0., 0.).into(),
            },
            |path| {
                loaded = Some(registry.open(&path, "new").map_err(|e| e.message)?);
                Ok(())
            },
        )
        .unwrap();
        assert_eq!(loaded.unwrap().text, "# 拖入\n正文");
        assert!(registry.release(&current.session_id, "existing").is_ok());
    }

    #[test]
    fn hovering_never_opens_and_unsupported_drops_report_an_error() {
        handle_drop(
            &DragDropEvent::Enter {
                paths: vec!["a.md".into()],
                position: (0., 0.).into(),
            },
            |_| panic!("hover must not open"),
        )
        .unwrap();
        assert!(
            handle_drop(
                &DragDropEvent::Drop {
                    paths: vec!["image.png".into()],
                    position: (0., 0.).into()
                },
                |_| panic!("unsupported must not open")
            )
            .is_err()
        );
    }
}

#[cfg(test)]
mod replacement_tests {
    use std::fs;
    use wtypora_document_core::Registry;
    #[test]
    fn reuse_releases_only_after_success_and_checks_session_owner() {
        let directory = tempfile::tempdir().unwrap();
        let registry = Registry::new(directory.path().join("data"));
        let empty = registry.create("main").unwrap();
        let path = directory.path().join("sample.md");
        fs::write(&path, "# opened").unwrap();
        assert!(
            registry
                .replace_untitled(&path, &empty.session_id, empty.epoch, "other")
                .is_err()
        );
        assert!(
            registry
                .replace_untitled(
                    &directory.path().join("missing.md"),
                    &empty.session_id,
                    empty.epoch,
                    "main"
                )
                .is_err()
        );
        let opened = registry
            .replace_untitled(&path, &empty.session_id, empty.epoch, "main")
            .unwrap();
        assert_eq!(opened.text, "# opened");
        assert!(registry.release(&empty.session_id, "main").is_err());
        assert!(
            registry
                .replace_untitled(&path, &opened.session_id, opened.epoch, "main")
                .is_err()
        );
        assert!(registry.release(&opened.session_id, "main").is_ok());
    }
}
