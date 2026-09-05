use crate::{atomic_save as disk, *};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
    time::{Duration, Instant},
};
struct Session {
    owner: String,
    restored_from: Option<String>,
    recovery_ids: HashSet<String>,
    receipt_order: VecDeque<String>,
    opened: Opened,
    observed: Option<Revision>,
    observed_error: Option<CoreError>,
    seq: u64,
    last_inspected: Option<Instant>,
    last_generation: u64,
    replies: HashMap<String, (String, SaveReply)>,
    save_as_replies: HashMap<String, (String, SaveAsResult)>,
}
const RECEIPT_LIMIT: usize = 128;
const RECONCILE_INTERVAL: Duration = Duration::from_secs(5);
impl Session {
    fn remember(&mut self, id: String) {
        self.receipt_order.push_back(id);
        while self.receipt_order.len() > RECEIPT_LIMIT {
            if let Some(old) = self.receipt_order.pop_front() {
                self.replies.remove(&old);
                self.save_as_replies.remove(&old);
            }
        }
    }
}
pub struct Registry {
    pub(crate) data_dir: PathBuf,
    state: Mutex<HashMap<String, Session>>,
    invalidation: crate::watch::Invalidation,
}
impl Registry {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            data_dir,
            state: Mutex::new(HashMap::new()),
            invalidation: crate::watch::Invalidation::new(),
        }
    }
    fn lock(&self) -> Result<MutexGuard<'_, HashMap<String, Session>>, CoreError> {
        self.state
            .lock()
            .map_err(|_| CoreError::new("internal", "会话锁不可用"))
    }
    fn sync_watches(&self, sessions: &HashMap<String, Session>) {
        self.invalidation.sync(
            sessions
                .values()
                .filter_map(|s| {
                    s.opened
                        .path
                        .as_ref()
                        .and_then(|p| Path::new(p).parent().map(Path::to_path_buf))
                })
                .collect(),
        );
    }
    fn grant<'a>(
        s: &'a mut HashMap<String, Session>,
        id: &str,
        epoch: u64,
        owner: &str,
    ) -> Result<&'a mut Session, CoreError> {
        let s = s
            .get_mut(id)
            .ok_or_else(|| CoreError::new("grant", "会话已关闭"))?;
        if s.owner != owner || s.opened.epoch != epoch {
            return Err(CoreError::new("grant", "会话授权或版本无效"));
        }
        Ok(s)
    }
    pub fn create(&self, owner: &str) -> Result<Opened, CoreError> {
        let o = Opened {
            session_id: uuid::Uuid::new_v4().to_string(),
            epoch: 0,
            path: None,
            text: String::new(),
            format: Format::default(),
            revision: None,
            read_only: false,
        };
        self.lock()?.insert(
            o.session_id.clone(),
            Session {
                owner: owner.into(),
                restored_from: None,
                recovery_ids: HashSet::new(),
                receipt_order: VecDeque::new(),
                opened: o.clone(),
                observed: None,
                observed_error: None,
                seq: 0,
                last_inspected: None,
                last_generation: 0,
                replies: HashMap::new(),
                save_as_replies: HashMap::new(),
            },
        );
        Ok(o)
    }
    pub fn open(&self, path: &Path, owner: &str) -> Result<Opened, CoreError> {
        let path = disk::normalized(path)?;
        let mut sessions = self.lock()?;
        if sessions
            .values()
            .any(|s| s.opened.path.as_deref() == path.to_str())
        {
            return Err(CoreError::new("alreadyOpen", "文件已在另一会话中打开"));
        }
        let (bytes, revision) = disk::read(&path)?;
        if sessions.values().any(|s| {
            s.opened
                .revision
                .as_ref()
                .is_some_and(|r| r.identity == revision.identity)
        }) {
            return Err(CoreError::new("alreadyOpen", "文件身份已在另一会话中打开"));
        }
        let decoded = codec::decode(&bytes)?;
        let o = Opened {
            session_id: uuid::Uuid::new_v4().to_string(),
            epoch: 0,
            path: Some(path.to_string_lossy().into()),
            text: decoded.text,
            format: decoded.format,
            revision: Some(revision.clone()),
            read_only: decoded.read_only,
        };
        sessions.insert(
            o.session_id.clone(),
            Session {
                owner: owner.into(),
                restored_from: None,
                recovery_ids: HashSet::new(),
                receipt_order: VecDeque::new(),
                opened: o.clone(),
                observed: Some(revision),
                observed_error: None,
                seq: 0,
                last_inspected: None,
                last_generation: 0,
                replies: HashMap::new(),
                save_as_replies: HashMap::new(),
            },
        );
        self.sync_watches(&sessions);
        Ok(o)
    }
    pub fn save(&self, req: SaveRequest, owner: &str) -> SaveReply {
        let result = (|| -> Result<SaveReply, CoreError> {
            let mut sessions = self.lock()?;
            let s = Self::grant(&mut sessions, &req.session_id, req.epoch, owner)?;
            let payload = serde_json::to_string(&req)
                .map_err(|e| CoreError::new("internal", &e.to_string()))?;
            let payload = disk::hash(payload.as_bytes());
            if s.save_as_replies.contains_key(&req.request_id) {
                return Err(CoreError::new("requestId", "请求 ID 已用于另存为"));
            }
            if let Some((prior, reply)) = s.replies.get(&req.request_id) {
                return if prior == &payload {
                    Ok(reply.clone())
                } else {
                    Err(CoreError::new("requestId", "请求 ID 已用于不同内容"))
                };
            }
            let outcome = (|| -> Result<SaveOutcome, CoreError> {
                if s.opened.read_only {
                    return Err(CoreError::new("readOnly", "文件为只读"));
                }
                let path = s
                    .opened
                    .path
                    .as_ref()
                    .ok_or_else(|| CoreError::new("needsPath", "请先选择保存路径"))?;
                let current = disk::observation(Path::new(path))?;
                if req.expected != s.opened.revision || current != s.opened.revision {
                    return Ok(SaveOutcome::Conflict { disk: current });
                }
                let bytes = codec::encode(&req.text, &s.opened.format)?;
                let revision = current.ok_or_else(|| CoreError::new("missing", "文件不存在"))?;
                if revision.hash == disk::hash(&bytes) {
                    return Ok(SaveOutcome::Unchanged {
                        revision,
                        durability: disk::confirm_existing(Path::new(path)),
                    });
                }
                match disk::replace(Path::new(path), &bytes, Some(&revision), &self.data_dir) {
                    Ok((revision, durability)) => {
                        s.opened.text = req.text.clone();
                        s.opened.revision = Some(revision.clone());
                        s.observed = Some(revision.clone());
                        s.observed_error = None;
                        Ok(SaveOutcome::Saved {
                            revision,
                            durability,
                        })
                    }
                    Err(e) if e.code == "conflict" => Ok(SaveOutcome::Conflict {
                        disk: disk::observation(Path::new(path))?,
                    }),
                    Err(e) => Err(e),
                }
            })()
            .unwrap_or_else(|error| SaveOutcome::Failed { error });
            let reply = SaveReply {
                session_id: req.session_id.clone(),
                epoch: req.epoch,
                request_id: req.request_id.clone(),
                version: req.version,
                outcome,
            };
            s.replies
                .insert(req.request_id.clone(), (payload, reply.clone()));
            s.remember(req.request_id.clone());
            Ok(reply)
        })();
        result.unwrap_or_else(|error| SaveReply {
            session_id: req.session_id,
            epoch: req.epoch,
            request_id: req.request_id,
            version: req.version,
            outcome: SaveOutcome::Failed { error },
        })
    }
    pub fn save_as(
        &self,
        req: SaveRequest,
        path: &Path,
        owner: &str,
    ) -> Result<SaveAsResult, CoreError> {
        let path = disk::normalized(path)?;
        let mut sessions = self.lock()?;
        if sessions.values().any(|s| {
            s.opened.session_id != req.session_id && s.opened.path.as_deref() == path.to_str()
        }) {
            return Err(CoreError::new("alreadyOpen", "目标文件已打开"));
        }
        let s = Self::grant(&mut sessions, &req.session_id, req.epoch, owner)?;
        let payload = serde_json::to_string(&(&req, &path))
            .map_err(|e| CoreError::new("internal", &e.to_string()))?;
        let payload = disk::hash(payload.as_bytes());
        if s.replies.contains_key(&req.request_id) {
            return Err(CoreError::new("requestId", "请求 ID 已用于保存"));
        }
        if let Some((prior, opened)) = s.save_as_replies.get(&req.request_id) {
            return if prior == &payload {
                {
                    let mut replay = opened.clone();
                    replay.opened.text = req.text.clone();
                    Ok(replay)
                }
            } else {
                Err(CoreError::new("requestId", "请求 ID 已用于不同内容"))
            };
        }
        if req.expected != s.opened.revision {
            return Err(CoreError::new("conflict", "会话版本已改变"));
        }
        if s.opened.read_only {
            return Err(CoreError::new("readOnly", "文件为只读"));
        }
        // A new destination is deliberately no-clobber: replacing another file needs a separate revision-bearing grant.
        let same = s.opened.path.as_deref() == path.to_str();
        let expected = if same {
            s.opened.revision.as_ref()
        } else {
            None
        };
        let bytes = codec::encode(&req.text, &s.opened.format)?;
        let unchanged = same && expected.is_some_and(|r| r.hash == disk::hash(&bytes));
        let (revision, durability) = if unchanged {
            let current = disk::observation(&path)?;
            if current.as_ref() != expected {
                return Err(CoreError::new("conflict", "磁盘版本已改变"));
            }
            (current.unwrap(), disk::confirm_existing(&path))
        } else {
            disk::replace(&path, &bytes, expected, &self.data_dir)?
        };
        s.opened.path = Some(path.to_string_lossy().into());
        s.opened.text = req.text;
        s.opened.revision = Some(revision.clone());
        s.observed = Some(revision.clone());
        s.observed_error = None;
        let outcome = if unchanged {
            SaveOutcome::Unchanged {
                revision,
                durability,
            }
        } else {
            SaveOutcome::Saved {
                revision,
                durability,
            }
        };
        let result = SaveAsResult {
            opened: s.opened.clone(),
            reply: SaveReply {
                session_id: req.session_id,
                epoch: req.epoch,
                request_id: req.request_id.clone(),
                version: req.version,
                outcome,
            },
        };
        let mut receipt = result.clone();
        receipt.opened.text.clear();
        s.save_as_replies
            .insert(req.request_id.clone(), (payload, receipt));
        s.remember(req.request_id);
        s.last_inspected = None;
        self.sync_watches(&sessions);
        Ok(result)
    }
    pub fn inspect(
        &self,
        id: &str,
        epoch: u64,
        owner: &str,
    ) -> Result<Option<DiskEvent>, CoreError> {
        let mut sessions = self.lock()?;
        let s = Self::grant(&mut sessions, id, epoch, owner)?;
        let Some(path) = &s.opened.path else {
            return Ok(None);
        };
        let generation = self.invalidation.generation();
        if self.invalidation.healthy()
            && s.last_generation == generation
            && s.last_inspected
                .is_some_and(|when| when.elapsed() < RECONCILE_INTERVAL)
        {
            return Ok(None);
        }
        // Capture before reading: a notification during this read remains pending.
        s.last_generation = generation;
        s.last_inspected = Some(Instant::now());
        let (revision, error) = match disk::observation(Path::new(path)) {
            Ok(revision) => (revision, None),
            Err(error) => (None, Some(error)),
        };
        if revision == s.observed && error == s.observed_error {
            return Ok(None);
        }
        s.observed = revision.clone();
        s.observed_error = error.clone();
        s.seq += 1;
        Ok(Some(DiskEvent {
            session_id: id.into(),
            epoch,
            event_seq: s.seq,
            kind: if error.is_some() {
                "unreadable"
            } else if revision.is_none() {
                "missing"
            } else {
                "changed"
            }
            .into(),
            revision,
        }))
    }
    fn candidate(s: &Session, expected: Option<Revision>) -> Result<Opened, CoreError> {
        let path = s
            .opened
            .path
            .as_ref()
            .ok_or_else(|| CoreError::new("needsPath", "文档尚未保存"))?;
        let (bytes, revision) = disk::read(Path::new(path))?;
        if expected.is_some() && expected.as_ref() != Some(&revision) {
            return Err(CoreError::new("conflict", "磁盘版本已再次改变"));
        }
        let d = codec::decode(&bytes)?;
        let mut o = s.opened.clone();
        o.text = d.text;
        o.format = d.format;
        o.read_only = d.read_only;
        o.revision = Some(revision);
        Ok(o)
    }
    pub fn reload(
        &self,
        id: &str,
        epoch: u64,
        expected: Option<Revision>,
        owner: &str,
    ) -> Result<Opened, CoreError> {
        let mut sessions = self.lock()?;
        Self::candidate(Self::grant(&mut sessions, id, epoch, owner)?, expected)
    }
    pub fn commit_reload(
        &self,
        id: &str,
        epoch: u64,
        expected: Revision,
        owner: &str,
    ) -> Result<Opened, CoreError> {
        let mut sessions = self.lock()?;
        let s = Self::grant(&mut sessions, id, epoch, owner)?;
        let mut o = Self::candidate(s, Some(expected))?;
        o.epoch += 1;
        s.observed = o.revision.clone();
        s.opened = o.clone();
        s.replies.clear();
        s.save_as_replies.clear();
        s.receipt_order.clear();
        s.observed_error = None;
        Ok(o)
    }
    pub fn release(&self, id: &str, owner: &str) -> Result<(), CoreError> {
        let mut sessions = self.lock()?;
        if sessions.get(id).is_none_or(|s| s.owner != owner) {
            return Err(CoreError::new("grant", "会话授权无效"));
        }
        sessions.remove(id);
        self.sync_watches(&sessions);
        Ok(())
    }
    pub fn owner_for_path(&self, path: &Path) -> Option<String> {
        let path = disk::normalized(path).ok()?;
        let identity = disk::read(&path).ok().map(|(_, r)| r.identity);
        self.lock()
            .ok()?
            .values()
            .find(|s| {
                s.opened.path.as_deref() == path.to_str()
                    || identity.as_ref().is_some_and(|identity| {
                        s.opened
                            .revision
                            .as_ref()
                            .is_some_and(|r| &r.identity == identity)
                    })
            })
            .map(|s| s.owner.clone())
    }
    pub fn write_recovery(
        &self,
        mut snapshot: RecoverySnapshot,
        owner: &str,
    ) -> Result<u64, CoreError> {
        let mut sessions = self.lock()?;
        let s = Self::grant(&mut sessions, &snapshot.session_id, snapshot.epoch, owner)?;
        snapshot.source_path = s.opened.path.clone();
        snapshot.source_revision = s.opened.revision.clone();
        snapshot.format = s.opened.format.clone();
        let id = snapshot.recovery_id.clone();
        let result = crate::recovery::write(&self.data_dir, snapshot);
        if result.is_ok() || result.as_ref().is_err_and(|e| e.code == "durability") {
            s.recovery_ids.insert(id);
        }
        result
    }
    pub fn list_recovery(&self) -> Result<RecoveryList, CoreError> {
        let sessions = self.lock()?;
        let mut list = crate::recovery::list(&self.data_dir)?;
        list.snapshots.retain(|snapshot| {
            !sessions.contains_key(&snapshot.session_id)
                && !sessions
                    .values()
                    .any(|s| s.restored_from.as_deref() == Some(&snapshot.recovery_id))
        });
        Ok(list)
    }
    pub fn discard_recovery(&self, id: &str) -> Result<(), CoreError> {
        self.discard_recovery_checked(id, None)
    }
    pub fn discard_recovery_owned(&self, id: &str, owner: &str) -> Result<(), CoreError> {
        self.discard_recovery_checked(id, Some(owner))
    }
    fn discard_recovery_checked(&self, id: &str, owner: Option<&str>) -> Result<(), CoreError> {
        let sessions = self.lock()?;
        let record = crate::recovery::verified(&self.data_dir, id).ok();
        if sessions.values().any(|s| {
            (s.recovery_ids.contains(id)
                || s.restored_from.as_deref() == Some(id)
                || record
                    .as_ref()
                    .is_some_and(|record| record.session_id == s.opened.session_id))
                && owner != Some(s.owner.as_str())
        }) {
            return Err(CoreError::new("grant", "无权删除其他活动会话的恢复记录"));
        }
        crate::recovery::discard(&self.data_dir, id)
    }
    pub fn restore_recovery(&self, id: &str, owner: &str) -> Result<Opened, CoreError> {
        let mut sessions = self.lock()?;
        let snapshot = crate::recovery::verified(&self.data_dir, id)?;
        if sessions.contains_key(&snapshot.session_id)
            || sessions
                .values()
                .any(|s| s.restored_from.as_deref() == Some(id))
        {
            return Err(CoreError::new("grant", "该恢复记录仍属于活动会话"));
        }
        codec::encode(&snapshot.text, &snapshot.format)?;
        let opened = Opened {
            session_id: uuid::Uuid::new_v4().to_string(),
            epoch: 0,
            path: None,
            text: snapshot.text,
            format: snapshot.format,
            revision: None,
            read_only: false,
        };
        sessions.insert(
            opened.session_id.clone(),
            Session {
                owner: owner.into(),
                restored_from: Some(id.into()),
                recovery_ids: HashSet::new(),
                receipt_order: VecDeque::new(),
                opened: opened.clone(),
                observed: None,
                observed_error: None,
                seq: 0,
                last_inspected: None,
                last_generation: 0,
                replies: HashMap::new(),
                save_as_replies: HashMap::new(),
            },
        );
        Ok(opened)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn real_notification_invalidates_and_quiet_inspect_skips_hashing() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("doc");
        std::fs::write(&p, "old").unwrap();
        let registry = Registry::new(d.path().join("data"));
        let opened = registry.open(&p, "owner").unwrap();
        assert!(registry.invalidation.healthy());
        registry
            .inspect(&opened.session_id, opened.epoch, "owner")
            .unwrap();
        let generation = registry.invalidation.generation();
        std::fs::write(&p, "new").unwrap();
        let deadline = Instant::now() + Duration::from_secs(4);
        while registry.invalidation.generation() == generation {
            assert!(Instant::now() < deadline, "native watcher did not signal");
            std::thread::sleep(Duration::from_millis(20));
        }
        assert!(
            registry
                .inspect(&opened.session_id, opened.epoch, "owner")
                .unwrap()
                .is_some()
        );
        // Mark the generation observed and establish a quiet interval. Reading an
        // unchanged file must not update the last full-inspection timestamp.
        {
            let mut sessions = registry.lock().unwrap();
            let s = sessions.get_mut(&opened.session_id).unwrap();
            s.last_generation = registry.invalidation.generation();
        }
        let inspected = registry
            .lock()
            .unwrap()
            .get(&opened.session_id)
            .unwrap()
            .last_inspected;
        registry
            .inspect(&opened.session_id, opened.epoch, "owner")
            .unwrap();
        assert_eq!(
            registry
                .lock()
                .unwrap()
                .get(&opened.session_id)
                .unwrap()
                .last_inspected,
            inspected
        );
        {
            let mut sessions = registry.lock().unwrap();
            sessions.get_mut(&opened.session_id).unwrap().last_inspected =
                Some(Instant::now() - RECONCILE_INTERVAL);
        }
        registry
            .inspect(&opened.session_id, opened.epoch, "owner")
            .unwrap();
        assert!(
            registry
                .lock()
                .unwrap()
                .get(&opened.session_id)
                .unwrap()
                .last_inspected
                > inspected
        );
    }
    #[test]
    fn receipts_are_bounded_and_do_not_retain_payload_text() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("doc");
        std::fs::write(&p, "hello").unwrap();
        let registry = Registry::new(d.path().join("data"));
        let opened = registry.open(&p, "owner").unwrap();
        for i in 0..150 {
            let req = SaveRequest {
                session_id: opened.session_id.clone(),
                epoch: opened.epoch,
                request_id: i.to_string(),
                version: i,
                text: opened.text.clone(),
                expected: opened.revision.clone(),
            };
            registry.save(req, "owner");
        }
        let sessions = registry.lock().unwrap();
        let session = sessions.get(&opened.session_id).unwrap();
        assert_eq!(session.replies.len(), RECEIPT_LIMIT);
        assert_eq!(session.receipt_order.len(), RECEIPT_LIMIT);
        assert!(!session.replies.contains_key("0"));
        assert!(
            session
                .replies
                .values()
                .all(|(digest, _)| digest.len() == 64)
        );
    }
}
