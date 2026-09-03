use crate::error::{NativeError, NativeResult};
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};

#[derive(Default)]
pub struct AccessState {
    roots: Mutex<Vec<PathBuf>>,
}

impl AccessState {
    pub fn grant(&self, path: impl AsRef<Path>) -> NativeResult<PathBuf> {
        let path = path.as_ref();
        let canonical = if path.exists() {
            path.canonicalize()
                .map_err(|error| NativeError::io(error, path))?
        } else {
            let parent = path.parent().ok_or_else(|| {
                NativeError::new("invalid_path", "The selected path has no parent").at(path)
            })?;
            parent
                .canonicalize()
                .map_err(|error| NativeError::io(error, parent))?
        };
        self.roots
            .lock()
            .expect("access roots poisoned")
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

        let roots = self.roots.lock().expect("access roots poisoned");
        if roots
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
