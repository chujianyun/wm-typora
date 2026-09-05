use crate::{CoreError, Revision};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};
/// Maximum previous file versions retained for each canonical document path.
pub(crate) const BACKUPS_PER_DOCUMENT: usize = 20;
fn prune_backups(dir: &Path) -> Result<(), CoreError> {
    let mut entries = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        if entry.file_type()?.is_file()
            && entry.path().extension().and_then(|s| s.to_str()) == Some("bak")
        {
            entries.push((entry.metadata()?.modified()?, entry.path()));
        }
    }
    entries.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.cmp(&a.1)));
    for (_, path) in entries.into_iter().skip(BACKUPS_PER_DOCUMENT) {
        fs::remove_file(path)?;
    }
    sync_dir(dir)?;
    Ok(())
}

pub(crate) fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub(crate) fn sync_dir(path: &Path) -> std::io::Result<()> {
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        std::fs::OpenOptions::new()
            .read(true)
            .custom_flags(windows_sys::Win32::Storage::FileSystem::FILE_FLAG_BACKUP_SEMANTICS)
            .open(path)?
            .sync_all()
    }
    #[cfg(not(windows))]
    {
        File::open(path)?.sync_all()
    }
}
pub(crate) fn confirm_existing(path: &Path) -> String {
    let confirmed = File::open(path).and_then(|f| f.sync_all()).is_ok()
        && path.parent().is_some_and(|p| sync_dir(p).is_ok());
    if confirmed { "confirmed" } else { "uncertain" }.into()
}
fn identity(m: &fs::Metadata) -> String {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        format!("{}:{}", m.dev(), m.ino())
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        format!("{}", m.creation_time())
    }
    #[cfg(not(any(unix, windows)))]
    {
        format!("{:?}", m.created())
    }
}
fn file_identity(file: &File, metadata: &fs::Metadata) -> Result<String, CoreError> {
    #[cfg(windows)]
    {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::Storage::FileSystem::{
            BY_HANDLE_FILE_INFORMATION, GetFileInformationByHandle,
        };
        let mut info: BY_HANDLE_FILE_INFORMATION = unsafe { std::mem::zeroed() };
        if unsafe { GetFileInformationByHandle(file.as_raw_handle(), &mut info) } == 0 {
            return Err(std::io::Error::last_os_error().into());
        }
        Ok(format!(
            "{}:{}:{}",
            info.dwVolumeSerialNumber, info.nFileIndexHigh, info.nFileIndexLow
        ))
    }
    #[cfg(not(windows))]
    {
        let _ = file;
        Ok(identity(metadata))
    }
}
pub(crate) fn normalized(path: &Path) -> Result<PathBuf, CoreError> {
    let name = path
        .file_name()
        .ok_or_else(|| CoreError::new("path", "文件路径无效"))?;
    let parent = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    Ok(parent.canonicalize()?.join(name))
}
pub(crate) fn read(path: &Path) -> Result<(Vec<u8>, Revision), CoreError> {
    read_bounded(path, 32 * 1024 * 1024)
}
pub(crate) fn read_bounded(path: &Path, limit: u64) -> Result<(Vec<u8>, Revision), CoreError> {
    let before = fs::symlink_metadata(path)?;
    if before.file_type().is_symlink() || !before.is_file() {
        return Err(CoreError::new("identity", "拒绝符号链接或非普通文件"));
    }
    if before.len() > limit {
        return Err(CoreError::new("limit", "文件超过 32 MiB"));
    }
    let f = File::open(path)?;
    let m = f.metadata()?;
    let opened_identity = file_identity(&f, &m)?;
    if identity(&before) != identity(&m) {
        return Err(CoreError::new("identity", "文件身份已改变"));
    }
    let mut bytes = Vec::new();
    f.take(limit + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > limit {
        return Err(CoreError::new("limit", "文件超过 32 MiB"));
    }
    let after = fs::symlink_metadata(path)?;
    #[cfg(windows)]
    if file_identity(&File::open(path)?, &after)? != opened_identity {
        return Err(CoreError::new("identity", "文件身份已改变"));
    }
    if after.file_type().is_symlink()
        || identity(&after) != identity(&m)
        || after.len() != m.len()
        || after.modified().ok() != m.modified().ok()
    {
        return Err(CoreError::new("conflict", "读取期间文件发生变化"));
    }
    let revision = Revision {
        hash: hash(&bytes),
        size: bytes.len() as u64,
        modified_at_ns: m
            .modified()?
            .duration_since(UNIX_EPOCH)
            .map_err(|_| CoreError::new("io", "文件时间无效"))?
            .as_nanos()
            .to_string(),
        identity: opened_identity,
    };
    Ok((bytes, revision))
}
pub(crate) fn observation(path: &Path) -> Result<Option<Revision>, CoreError> {
    match read(path) {
        Ok((_, r)) => Ok(Some(r)),
        Err(e) if !path.try_exists().unwrap_or(true) && e.code == "io" => Ok(None),
        Err(e) => Err(e),
    }
}

#[derive(Default)]
pub(crate) struct Faults {
    pub before_commit: bool,
    pub after_commit: bool,
}
pub(crate) fn replace(
    path: &Path,
    bytes: &[u8],
    expected: Option<&Revision>,
    data: &Path,
) -> Result<(Revision, String), CoreError> {
    replace_with_faults(path, bytes, expected, data, &Faults::default())
}
fn replace_with_faults(
    path: &Path,
    bytes: &[u8],
    expected: Option<&Revision>,
    data: &Path,
    faults: &Faults,
) -> Result<(Revision, String), CoreError> {
    let parent = path
        .parent()
        .ok_or_else(|| CoreError::new("path", "缺少父目录"))?;
    let mut temp = tempfile::NamedTempFile::new_in(parent)?;
    temp.write_all(bytes)?;
    if let Some(expected) = expected {
        let (old, current) = read(path)?;
        if &current != expected {
            return Err(CoreError::new("conflict", "磁盘版本已改变"));
        }
        temp.as_file()
            .set_permissions(fs::metadata(path)?.permissions())?;
        #[cfg(unix)]
        for key in xattr::list(path)? {
            if let Some(value) = xattr::get(path, &key)? {
                xattr::set(temp.path(), &key, &value)?;
            }
        }
        let backup = data
            .join("backups")
            .join(hash(path.to_string_lossy().as_bytes()));
        fs::create_dir_all(&backup)?;
        private_dir(&backup)?;
        let mut b = tempfile::NamedTempFile::new_in(&backup)?;
        b.write_all(&old)?;
        b.as_file().sync_all()?;
        b.persist_noclobber(backup.join(format!("{}.bak", uuid::Uuid::new_v4())))
            .map_err(|e| CoreError::from(e.error))?;
        sync_dir(&backup)?;
        prune_backups(&backup)?;
    }
    temp.as_file().sync_all()?;
    if faults.before_commit {
        return Err(CoreError::new("io", "injected pre-commit failure"));
    }
    if observation(path)?.as_ref() != expected {
        return Err(CoreError::new("conflict", "提交前磁盘版本已改变"));
    }
    let (_, revision) = read(temp.path())?;
    if expected.is_none() {
        temp.persist_noclobber(path)
            .map_err(|e| CoreError::from(e.error))?;
    } else {
        #[cfg(not(windows))]
        {
            temp.persist(path).map_err(|e| CoreError::from(e.error))?;
        }
        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStrExt;
            let target: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
            let source: Vec<u16> = temp
                .path()
                .as_os_str()
                .encode_wide()
                .chain(Some(0))
                .collect();
            let ok = unsafe {
                windows_sys::Win32::Storage::FileSystem::ReplaceFileW(
                    target.as_ptr(),
                    source.as_ptr(),
                    std::ptr::null(),
                    0,
                    std::ptr::null(),
                    std::ptr::null(),
                )
            };
            if ok == 0 {
                return Err(std::io::Error::last_os_error().into());
            }
        }
    }
    // Once replacement succeeds, errors must never be represented as retryable failure.
    let durable = !faults.after_commit && sync_dir(parent).is_ok();
    // Windows replacement can change metadata. A failed verification after the
    // commit reports saved/uncertain, never a failure inviting blind retry.
    let verified = read(path)
        .ok()
        .map(|(_, actual)| actual)
        .filter(|actual| actual.hash == revision.hash);
    let durable = durable && verified.is_some();
    let revision = verified.unwrap_or(revision);
    Ok((
        revision,
        if durable { "confirmed" } else { "uncertain" }.into(),
    ))
}
pub(crate) fn private_dir(path: &Path) -> Result<(), CoreError> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn backups_are_bounded_per_document() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("doc");
        fs::write(&p, "0").unwrap();
        for i in 1..=25 {
            let (_, revision) = read(&p).unwrap();
            replace(&p, i.to_string().as_bytes(), Some(&revision), d.path()).unwrap();
        }
        let backup = d
            .path()
            .join("backups")
            .join(hash(p.to_string_lossy().as_bytes()));
        assert_eq!(fs::read_dir(backup).unwrap().count(), BACKUPS_PER_DOCUMENT);
        assert_eq!(fs::read_to_string(&p).unwrap(), "25");
    }
    #[test]
    fn failures_preserve_original_or_report_saved_uncertain() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("doc");
        fs::write(&p, "old").unwrap();
        let (_, r) = read(&p).unwrap();
        assert!(
            replace_with_faults(
                &p,
                b"new",
                Some(&r),
                d.path(),
                &Faults {
                    before_commit: true,
                    after_commit: false
                }
            )
            .is_err()
        );
        assert_eq!(fs::read(&p).unwrap(), b"old");
        let (_, durability) = replace_with_faults(
            &p,
            b"new",
            Some(&r),
            d.path(),
            &Faults {
                before_commit: false,
                after_commit: true,
            },
        )
        .unwrap();
        assert_eq!(durability, "uncertain");
        assert_eq!(fs::read(&p).unwrap(), b"new");
    }
}
