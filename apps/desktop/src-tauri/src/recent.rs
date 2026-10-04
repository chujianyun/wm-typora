use std::{fs, io::Write, path::PathBuf};

const LIMIT: usize = 10;

pub struct RecentFiles {
    file: PathBuf,
    paths: Vec<PathBuf>,
}

impl RecentFiles {
    pub fn load(file: PathBuf) -> Self {
        let paths: Vec<PathBuf> = fs::read(&file)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        let mut unique = Vec::new();
        for path in paths {
            if path.is_absolute() && !unique.contains(&path) {
                unique.push(path);
            }
        }
        unique.truncate(LIMIT);
        Self {
            file,
            paths: unique,
        }
    }

    pub fn list(&self) -> Vec<PathBuf> {
        self.paths.clone()
    }

    pub fn record(&mut self, path: PathBuf) -> Result<(), String> {
        let mut paths = self.paths.clone();
        paths.retain(|p| p != &path);
        paths.insert(0, path);
        paths.truncate(LIMIT);
        let parent = self.file.parent().ok_or("历史记录目录无效")?;
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
        let bytes = serde_json::to_vec(&paths).map_err(|e| e.to_string())?;
        temp.write_all(&bytes).map_err(|e| e.to_string())?;
        temp.as_file().sync_all().map_err(|e| e.to_string())?;
        temp.persist(&self.file).map_err(|e| e.to_string())?;
        self.paths = paths;
        Ok(())
    }
}

pub fn record(app: &tauri::AppHandle, path: &std::path::Path) {
    use tauri::{Emitter, Manager};
    let result = app
        .state::<crate::AppState>()
        .recent
        .lock()
        .unwrap()
        .record(path.into());
    if let Err(error) = result {
        let _ = app.emit(
            "document-open-error",
            format!("最近打开记录保存失败：{error}"),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retains_ten_unique_paths_in_recency_order_across_restarts() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("data/recent.json");
        let mut history = RecentFiles::load(file.clone());
        for i in 0..12 {
            history.record(dir.path().join(format!("{i}.md"))).unwrap();
        }
        history.record(dir.path().join("5.md")).unwrap();
        let paths = RecentFiles::load(file).list();
        assert_eq!(paths.len(), 10);
        assert_eq!(paths[0], dir.path().join("5.md"));
        assert_eq!(paths[1], dir.path().join("11.md"));
        assert_eq!(paths[9], dir.path().join("2.md"));
        assert_eq!(paths.iter().filter(|p| p.ends_with("5.md")).count(), 1);
    }

    #[test]
    fn damaged_history_does_not_prevent_opening_or_future_records() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("recent.json");
        fs::write(&file, "broken").unwrap();
        let mut history = RecentFiles::load(file.clone());
        assert!(history.list().is_empty());
        history.record(dir.path().join("中文 文件.md")).unwrap();
        assert_eq!(RecentFiles::load(file).list(), history.list());
    }
}
