use crate::{atomic_save as disk, *};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};
#[derive(Serialize, Deserialize)]
struct Envelope {
    schema: u32,
    checksum: String,
    snapshot: RecoverySnapshot,
}
// Compiled only into Rust's unit-test executable. Production binaries expose
// neither a crash hook nor an environment variable controlling persistence.
#[cfg(test)]
type TestCheckpoint = Box<dyn Fn(&str)>;
#[cfg(test)]
thread_local! {static CHECKPOINT:std::cell::RefCell<Option<TestCheckpoint>>=const{std::cell::RefCell::new(None)};}
#[cfg(test)]
fn checkpoint(stage: &str) {
    CHECKPOINT.with(|hook| {
        if let Some(hook) = hook.borrow().as_ref() {
            hook(stage)
        }
    });
}
fn path(data: &Path, id: &str) -> Result<PathBuf, CoreError> {
    let uuid = uuid::Uuid::parse_str(id)
        .map_err(|_| CoreError::new("recoveryId", "恢复 ID 必须是 UUID"))?;
    if uuid.to_string() != id {
        return Err(CoreError::new("recoveryId", "恢复 ID 必须是规范 UUID"));
    }
    Ok(data.join("recovery").join(format!("{id}.json")))
}
fn load(path: &Path) -> Result<RecoverySnapshot, CoreError> {
    // JSON escaping can expand a valid 32 MiB document to six times its size.
    let (bytes, _) = disk::read_bounded(path, 200 * 1024 * 1024)?;
    let envelope: Envelope = serde_json::from_slice(&bytes)
        .map_err(|e| CoreError::new("recoveryCorrupt", &e.to_string()))?;
    let payload = serde_json::to_vec(&envelope.snapshot)
        .map_err(|e| CoreError::new("recoveryCorrupt", &e.to_string()))?;
    if envelope.schema != 1 || envelope.checksum != disk::hash(&payload) {
        return Err(CoreError::new("recoveryCorrupt", "恢复记录格式或校验失败"));
    }
    Ok(envelope.snapshot)
}
pub(crate) fn verified(data: &Path, id: &str) -> Result<RecoverySnapshot, CoreError> {
    let snapshot = load(&path(data, id)?)?;
    if snapshot.recovery_id != id {
        return Err(CoreError::new("recoveryCorrupt", "恢复 ID 不匹配"));
    }
    Ok(snapshot)
}
pub(crate) fn write(data: &Path, snapshot: RecoverySnapshot) -> Result<u64, CoreError> {
    write_with_sync(data, snapshot, &|dir| {
        disk::sync_dir(dir).map_err(|e| {
            CoreError::new(
                "durability",
                &format!("恢复记录已写入，但目录持久化未确认：{e}"),
            )
        })
    })
}
fn write_with_sync(
    data: &Path,
    snapshot: RecoverySnapshot,
    sync: &dyn Fn(&Path) -> Result<(), CoreError>,
) -> Result<u64, CoreError> {
    let p = path(data, &snapshot.recovery_id)?;
    codec::encode(&snapshot.text, &snapshot.format)?;
    if p.try_exists()? {
        let previous = load(&p)?;
        if previous.session_id != snapshot.session_id {
            return Err(CoreError::new("grant", "恢复记录属于其他会话"));
        }
        if previous.epoch > snapshot.epoch
            || (previous.epoch == snapshot.epoch && previous.version > snapshot.version)
        {
            return Err(CoreError::new("stale", "恢复版本过旧"));
        }
        if previous.epoch == snapshot.epoch && previous.version == snapshot.version {
            if previous.text != snapshot.text {
                return Err(CoreError::new("stale", "同一版本的内容不同"));
            }
            sync(p.parent().unwrap())?;
            sync(data)?;
            if let Some(parent) = data.parent() {
                sync(parent)?;
            }
            return Ok(snapshot.version);
        }
    }
    let dir = p.parent().unwrap();
    fs::create_dir_all(dir)?;
    disk::private_dir(dir)?;
    let version = snapshot.version;
    let payload = serde_json::to_vec(&snapshot)
        .map_err(|e| CoreError::new("recoveryCorrupt", &e.to_string()))?;
    let envelope = Envelope {
        schema: 1,
        checksum: disk::hash(&payload),
        snapshot,
    };
    let bytes = serde_json::to_vec(&envelope)
        .map_err(|e| CoreError::new("recoveryCorrupt", &e.to_string()))?;
    let mut temp = tempfile::NamedTempFile::new_in(dir)?;
    temp.write_all(&bytes)?;
    #[cfg(test)]
    checkpoint("temp-written");
    temp.as_file().sync_all()?;
    #[cfg(test)]
    checkpoint("before-rename");
    temp.persist(&p).map_err(|e| CoreError::from(e.error))?;
    sync(dir)?;
    sync(data)?;
    if let Some(parent) = data.parent() {
        sync(parent)?;
    }
    #[cfg(test)]
    checkpoint("confirmed");
    Ok(version)
}
pub(crate) fn list(data: &Path) -> Result<RecoveryList, CoreError> {
    let mut result = RecoveryList {
        snapshots: vec![],
        warnings: vec![],
    };
    let dir = data.join("recovery");
    if !dir.try_exists()? {
        return Ok(result);
    }
    for entry in fs::read_dir(dir)? {
        match entry {
            Ok(e) => {
                let p = e.path();
                if p.extension().and_then(|v| v.to_str()) != Some("json") {
                    continue;
                }
                let id = p.file_stem().and_then(|v| v.to_str()).unwrap_or("");
                match path(data, id).and_then(|_| load(&p)) {
                    Ok(s) if s.recovery_id == id => result.snapshots.push(s),
                    Ok(_) => result.warnings.push(format!("{id}: recovery ID mismatch")),
                    Err(e) => result.warnings.push(format!("{id}: {}", e.message)),
                }
            }
            Err(e) => result.warnings.push(e.to_string()),
        }
    }
    result
        .snapshots
        .sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(result)
}
pub(crate) fn discard(data: &Path, id: &str) -> Result<(), CoreError> {
    let p = path(data, id)?;
    match fs::remove_file(&p) {
        Ok(()) => disk::sync_dir(p.parent().unwrap()).map_err(|e| {
            CoreError::new(
                "durability",
                &format!("恢复记录已删除，但目录持久化未确认：{e}"),
            )
        }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn crash_snapshot(id: &str, version: u64) -> RecoverySnapshot {
        RecoverySnapshot {
            session_id: "crash-session".into(),
            epoch: 0,
            recovery_id: id.into(),
            version,
            text: if version == 1 {
                "last confirmed\r\n".into()
            } else {
                "new complete version 世界\r\n".repeat(2000)
            },
            format: Format {
                encoding: "utf-8-bom".into(),
                eol: "crlf".into(),
            },
            source_path: None,
            source_revision: None,
            updated_at: format!("version-{version}"),
        }
    }
    #[test]
    #[ignore = "child harness invoked only by parent crash test"]
    fn crash_child_worker() {
        let Ok(data) = std::env::var("WTYPORA_TEST_CRASH_DIR") else {
            return;
        };
        let id = std::env::var("WTYPORA_TEST_CRASH_ID").unwrap();
        let stage = std::env::var("WTYPORA_TEST_CRASH_STAGE").unwrap();
        let marker = PathBuf::from(std::env::var("WTYPORA_TEST_CRASH_MARKER").unwrap());
        CHECKPOINT.with(|hook| {
            *hook.borrow_mut() = Some(Box::new(move |point| {
                if point == stage {
                    fs::write(&marker, point).unwrap();
                    loop {
                        std::thread::park();
                    }
                }
            }))
        });
        write(Path::new(&data), crash_snapshot(&id, 2)).unwrap();
        panic!("requested checkpoint was not reached");
    }
    #[test]
    fn killed_child_restart_keeps_only_complete_recovery() {
        use std::{
            process::{Command, Stdio},
            time::{Duration, Instant},
        };
        for stage in ["temp-written", "before-rename", "confirmed"] {
            let dir = tempfile::tempdir().unwrap();
            let id = uuid::Uuid::new_v4().to_string();
            write(dir.path(), crash_snapshot(&id, 1)).unwrap();
            let marker = dir.path().join("checkpoint");
            let mut child = Command::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "recovery::tests::crash_child_worker",
                    "--ignored",
                    "--nocapture",
                ])
                .env("WTYPORA_TEST_CRASH_DIR", dir.path())
                .env("WTYPORA_TEST_CRASH_ID", &id)
                .env("WTYPORA_TEST_CRASH_STAGE", stage)
                .env("WTYPORA_TEST_CRASH_MARKER", &marker)
                .stdout(Stdio::null())
                .stderr(Stdio::inherit())
                .spawn()
                .unwrap();
            let deadline = Instant::now() + Duration::from_secs(8);
            while !marker.exists() {
                if let Some(status) = child.try_wait().unwrap() {
                    panic!("child exited before {stage}: {status}");
                }
                if Instant::now() >= deadline {
                    child.kill().unwrap();
                    child.wait().unwrap();
                    panic!("child failed to reach {stage}");
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            child.kill().unwrap();
            let status = child.wait().unwrap();
            assert!(!status.success());
            let restarted = crate::Registry::new(dir.path().into());
            let list = restarted.list_recovery().unwrap();
            assert!(list.warnings.is_empty(), "{stage}: {:?}", list.warnings);
            assert_eq!(list.snapshots.len(), 1);
            let expected = crash_snapshot(&id, if stage == "confirmed" { 2 } else { 1 });
            assert_eq!(list.snapshots[0].version, expected.version, "{stage}");
            assert_eq!(list.snapshots[0].text, expected.text, "{stage}");
            assert_eq!(list.snapshots[0].format, expected.format, "{stage}");
            let restored = restarted.restore_recovery(&id, "restarted").unwrap();
            assert_eq!(restored.text, expected.text);
            assert_eq!(restored.format, expected.format);
        }
    }
    #[test]
    fn directory_sync_failure_never_confirms_recovery() {
        let d = tempfile::tempdir().unwrap();
        let snapshot = RecoverySnapshot {
            session_id: "session".into(),
            epoch: 0,
            recovery_id: uuid::Uuid::new_v4().to_string(),
            version: 1,
            text: "draft".into(),
            format: Format::default(),
            source_path: None,
            source_revision: None,
            updated_at: "now".into(),
        };
        let error = write_with_sync(d.path(), snapshot.clone(), &|_| {
            Err(CoreError::new(
                "durability",
                "injected directory flush failure",
            ))
        })
        .unwrap_err();
        assert_eq!(error.code, "durability");
        assert_eq!(
            verified(d.path(), &snapshot.recovery_id).unwrap().text,
            "draft"
        );
        assert_eq!(write(d.path(), snapshot).unwrap(), 1);
    }
}
