use crate::error::{NativeError, NativeResult};
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};

#[derive(Default)]
pub struct AccessState {
    files: Mutex<Vec<PathBuf>>,
    directories: Mutex<Vec<PathBuf>>,
}

impl AccessState {
    fn normalize_file(path: &Path) -> NativeResult<PathBuf> {
        let normalized = if path.exists() {
            path.canonicalize()
                .map_err(|error| NativeError::io(error, path))?
        } else {
            let parent = path.parent().ok_or_else(|| {
                NativeError::new("invalid_path", "The selected path has no parent").at(path)
            })?;
            parent
                .canonicalize()
                .map_err(|error| NativeError::io(error, parent))?
                .join(path.file_name().ok_or_else(|| {
                    NativeError::new("invalid_path", "The selected path has no file name").at(path)
                })?)
        };
        Ok(normalized)
    }

    pub fn grant_file(&self, path: impl AsRef<Path>) -> NativeResult<PathBuf> {
        let canonical = Self::normalize_file(path.as_ref())?;
        self.files
            .lock()
            .expect("access files poisoned")
            .push(canonical.clone());
        Ok(canonical)
    }

    pub fn grant_directory(&self, path: impl AsRef<Path>) -> NativeResult<PathBuf> {
        let path = path.as_ref();
        let canonical = path
            .canonicalize()
            .map_err(|error| NativeError::io(error, path))?;
        if !canonical.is_dir() {
            return Err(
                NativeError::new("invalid_path", "The selected path is not a directory").at(path),
            );
        }
        self.directories
            .lock()
            .expect("access directories poisoned")
            .push(canonical.clone());
        Ok(canonical)
    }

    pub fn resolve_allowed(&self, path: impl AsRef<Path>) -> NativeResult<PathBuf> {
        let path = path.as_ref();
        let candidate = if path.exists() {
            path.canonicalize()
                .map_err(|error| NativeError::io(error, path))?
        } else {
            let parent = path.parent().ok_or_else(|| {
                NativeError::new("invalid_path", "Path has no parent directory").at(path)
            })?;
            let parent = parent
                .canonicalize()
                .map_err(|error| NativeError::io(error, parent))?;
            parent.join(path.file_name().ok_or_else(|| {
                NativeError::new("invalid_path", "Path has no file name").at(path)
            })?)
        };

        let files = self.files.lock().expect("access files poisoned");
        let directories = self
            .directories
            .lock()
            .expect("access directories poisoned");
        if files.contains(&candidate)
            || directories
                .iter()
                .any(|root| candidate == *root || candidate.starts_with(root))
        {
            Ok(candidate)
        } else {
            Err(NativeError::new(
                "path_not_allowed",
                "The path is outside the files and folders selected by the user",
            )
            .at(path))
        }
    }
}
