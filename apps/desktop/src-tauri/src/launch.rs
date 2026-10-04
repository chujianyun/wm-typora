use std::path::PathBuf;
use tauri::RunEvent;

/// macOS can deliver Opened before Tauri has run setup or created any windows.
/// Keep these paths outside managed state until Ready guarantees setup finished.
#[derive(Default)]
pub struct LaunchFiles {
    ready: bool,
    pending: Vec<PathBuf>,
}

impl LaunchFiles {
    pub fn on_event(&mut self, event: &RunEvent) -> Vec<PathBuf> {
        match event {
            RunEvent::Opened { urls } => {
                self.pending
                    .extend(urls.iter().filter_map(|url| url.to_file_path().ok()));
            }
            RunEvent::Ready => self.ready = true,
            _ => return Vec::new(),
        }
        if self.ready {
            std::mem::take(&mut self.pending)
        } else {
            Vec::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::Url;
    use wtypora_document_core::Registry;

    #[test]
    fn cold_open_waits_for_setup_and_preserves_all_files() {
        let dir = tempfile::tempdir().unwrap();
        let paths = [
            dir.path().join("中文 空格 #1.MD"),
            dir.path().join("second.md"),
        ];
        let mut launch = LaunchFiles::default();
        for path in &paths {
            std::fs::write(path, "# Cold start\n正文").unwrap();
            assert!(
                launch
                    .on_event(&RunEvent::Opened {
                        urls: vec![Url::from_file_path(path).unwrap()],
                    })
                    .is_empty(),
                "opening before setup accesses unregistered AppState"
            );
        }
        // The registry only exists after setup, just as in the real application.
        let registry = Registry::new(dir.path().join("data"));
        let queued = launch.on_event(&RunEvent::Ready);
        assert_eq!(queued, paths);
        for (index, path) in queued.iter().enumerate() {
            let opened = registry.open(path, &format!("doc-{index}")).unwrap();
            assert_eq!(opened.text, "# Cold start\n正文");
        }
        assert!(launch.on_event(&RunEvent::Ready).is_empty());
    }

    #[test]
    fn warm_open_is_immediate_and_non_file_urls_are_ignored() {
        let mut launch = LaunchFiles::default();
        assert!(launch.on_event(&RunEvent::Ready).is_empty());
        let path = PathBuf::from("/tmp/文档 with spaces.md");
        assert_eq!(
            launch.on_event(&RunEvent::Opened {
                urls: vec![
                    Url::parse("https://example.com/document.md").unwrap(),
                    Url::from_file_path(&path).unwrap(),
                ],
            }),
            vec![path]
        );
        assert!(launch.on_event(&RunEvent::Resumed).is_empty());
        assert!(launch.on_event(&RunEvent::Ready).is_empty());
    }
}
