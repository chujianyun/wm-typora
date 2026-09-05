use std::fs;
use wtypora_document_core::*;
fn request(o: &Opened, text: &str) -> SaveRequest {
    SaveRequest {
        session_id: o.session_id.clone(),
        epoch: o.epoch,
        request_id: uuid::Uuid::new_v4().to_string(),
        version: 1,
        text: text.into(),
        expected: o.revision.clone(),
    }
}
#[test]
fn save_grants_noop_conflict_and_replay() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("a.md");
    fs::write(&p, "hello").unwrap();
    let r = Registry::new(d.path().join("data"));
    let o = r.open(&p, "one").unwrap();
    assert!(matches!(
        r.save(request(&o, "bad"), "two").outcome,
        SaveOutcome::Failed { .. }
    ));
    let q = request(&o, "hello");
    assert!(matches!(
        r.save(q.clone(), "one").outcome,
        SaveOutcome::Unchanged { .. }
    ));
    let mut forged = q.clone();
    forged.text = "different".into();
    assert!(matches!(
        r.save(forged, "one").outcome,
        SaveOutcome::Failed { .. }
    ));
    fs::write(&p, "outside").unwrap();
    assert!(matches!(
        r.save(request(&o, "ours"), "one").outcome,
        SaveOutcome::Conflict { .. }
    ));
    assert_eq!(fs::read_to_string(p).unwrap(), "outside");
}
#[test]
fn reload_is_two_phase_and_missing_observations_deduplicate() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("a");
    fs::write(&p, "first").unwrap();
    let r = Registry::new(d.path().join("data"));
    let o = r.open(&p, "one").unwrap();
    fs::write(&p, "second").unwrap();
    let e = r.inspect(&o.session_id, o.epoch, "one").unwrap().unwrap();
    assert!(r.inspect(&o.session_id, o.epoch, "one").unwrap().is_none());
    let candidate = r
        .reload(&o.session_id, o.epoch, e.revision.clone(), "one")
        .unwrap();
    fs::write(&p, "third").unwrap();
    assert!(
        r.commit_reload(&o.session_id, o.epoch, candidate.revision.unwrap(), "one")
            .is_err()
    );
    fs::remove_file(&p).unwrap();
    assert_eq!(
        await_disk_event_owned(&r, &o, "missing", "one").kind,
        "missing"
    );
}
#[test]
fn bom_crlf_and_save_as_identity() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("a");
    fs::write(&p, b"\xef\xbb\xbfa\r\n").unwrap();
    let r = Registry::new(d.path().join("data"));
    let o = r.open(&p, "one").unwrap();
    let n = r
        .save_as(request(&o, "b\r\n"), &d.path().join("b"), "one")
        .unwrap()
        .opened;
    assert_eq!(o.session_id, n.session_id);
    assert_eq!(o.epoch, n.epoch);
    assert_eq!(fs::read(d.path().join("b")).unwrap(), b"\xef\xbb\xbfb\r\n");
    let bad = d.path().join("missing").join("c");
    assert!(r.save_as(request(&n, "c\r\n"), &bad, "one").is_err());
    assert_eq!(r.owner_for_path(&d.path().join("b")), Some("one".into()));
}
#[cfg(unix)]
#[test]
fn symlink_swap_rejected() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("a");
    let other = d.path().join("other");
    fs::write(&p, "a").unwrap();
    fs::write(&other, "other").unwrap();
    let r = Registry::new(d.path().join("data"));
    let o = r.open(&p, "one").unwrap();
    fs::remove_file(&p).unwrap();
    std::os::unix::fs::symlink(&other, &p).unwrap();
    assert!(matches!(
        r.save(request(&o, "oops"), "one").outcome,
        SaveOutcome::Failed { .. }
    ));
    assert_eq!(fs::read_to_string(other).unwrap(), "other");
    assert_eq!(
        r.inspect(&o.session_id, o.epoch, "one")
            .unwrap()
            .unwrap()
            .kind,
        "unreadable"
    );
    assert!(r.inspect(&o.session_id, o.epoch, "one").unwrap().is_none());
}
fn snapshot(o: &Opened, id: &str, version: u64) -> RecoverySnapshot {
    RecoverySnapshot {
        session_id: o.session_id.clone(),
        epoch: o.epoch,
        recovery_id: id.into(),
        version,
        text: "draft".into(),
        format: o.format.clone(),
        source_path: Some("/forged".into()),
        source_revision: None,
        updated_at: "2026-09-05T00:00:00Z".into(),
    }
}
#[test]
fn recovery_validates_grants_versions_checksum_and_isolates_corruption() {
    let d = tempfile::tempdir().unwrap();
    let r = Registry::new(d.path().into());
    let o = r.create("one").unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let s = snapshot(&o, &id, 2);
    assert!(r.write_recovery(s.clone(), "other").is_err());
    assert!(r.write_recovery(snapshot(&o, "../bad", 2), "one").is_err());
    assert_eq!(r.write_recovery(s, "one").unwrap(), 2);
    assert!(r.write_recovery(snapshot(&o, &id, 1), "one").is_err());
    assert!(r.list_recovery().unwrap().snapshots.is_empty());
    let restarted = Registry::new(d.path().into());
    assert!(
        restarted.list_recovery().unwrap().snapshots[0]
            .source_path
            .is_none()
    );
    let corrupt = uuid::Uuid::new_v4().to_string();
    fs::write(
        d.path().join("recovery").join(format!("{corrupt}.json")),
        "broken",
    )
    .unwrap();
    let list = restarted.list_recovery().unwrap();
    assert_eq!(list.snapshots.len(), 1);
    assert_eq!(list.warnings.len(), 1);
    let p = d.path().join("recovery").join(format!("{id}.json"));
    let mut data: serde_json::Value = serde_json::from_slice(&fs::read(&p).unwrap()).unwrap();
    data["snapshot"]["text"] = "tampered".into();
    fs::write(p, serde_json::to_vec(&data).unwrap()).unwrap();
    assert_eq!(r.list_recovery().unwrap().warnings.len(), 2);
    r.release(&o.session_id, "one").unwrap();
    assert!(r.write_recovery(snapshot(&o, &id, 3), "one").is_err());
    assert!(r.discard_recovery("../bad").is_err());
    r.discard_recovery(&id).unwrap();
}
#[test]
fn no_op_preserves_revision_and_new_destination_does_not_clobber() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("a");
    let b = d.path().join("b");
    fs::write(&p, "a").unwrap();
    fs::write(&b, "b").unwrap();
    let r = Registry::new(d.path().join("data"));
    let o = r.open(&p, "one").unwrap();
    match r.save(request(&o, "a"), "one").outcome {
        SaveOutcome::Unchanged { revision, .. } => assert_eq!(Some(revision), o.revision),
        other => panic!("{other:?}"),
    };
    assert!(r.save_as(request(&o, "replacement"), &b, "one").is_err());
    assert_eq!(fs::read_to_string(&b).unwrap(), "b");
    assert_eq!(r.owner_for_path(&p), Some("one".into()));
}
#[test]
fn save_as_replay_is_idempotent_and_rejects_changed_payload() {
    let d = tempfile::tempdir().unwrap();
    let r = Registry::new(d.path().join("data"));
    let o = r.create("one").unwrap();
    let q = request(&o, "new");
    let p = d.path().join("doc");
    let saved = r.save_as(q.clone(), &p, "one").unwrap();
    assert_eq!(
        r.save_as(q.clone(), &p, "one").unwrap().opened.revision,
        saved.opened.revision
    );
    let mut changed = q;
    changed.text = "changed".into();
    assert!(r.save_as(changed, &p, "one").is_err());
}
#[cfg(unix)]
#[test]
fn save_preserves_mode_and_xattrs() {
    use std::os::unix::fs::PermissionsExt;
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("doc");
    fs::write(&p, "old").unwrap();
    fs::set_permissions(&p, fs::Permissions::from_mode(0o640)).unwrap();
    xattr::set(&p, "user.wtypora-test", b"metadata").unwrap();
    let r = Registry::new(d.path().join("data"));
    let o = r.open(&p, "one").unwrap();
    assert!(matches!(
        r.save(request(&o, "new"), "one").outcome,
        SaveOutcome::Saved { .. }
    ));
    assert_eq!(
        fs::metadata(&p).unwrap().permissions().mode() & 0o777,
        0o640
    );
    assert_eq!(
        xattr::get(&p, "user.wtypora-test").unwrap().unwrap(),
        b"metadata"
    );
}
#[test]
fn save_reply_correlates_and_reload_commit_revokes_old_epoch() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("doc");
    fs::write(&p, "old").unwrap();
    let r = Registry::new(d.path().join("data"));
    let o = r.open(&p, "one").unwrap();
    let mut q = request(&o, "saved snapshot");
    q.version = 42;
    let reply = r.save(q.clone(), "one");
    assert_eq!(reply.request_id, q.request_id);
    assert_eq!(reply.epoch, q.epoch);
    assert_eq!(reply.version, 42);
    let revision = match reply.outcome {
        SaveOutcome::Saved { revision, .. } => revision,
        other => panic!("{other:?}"),
    };
    assert!(matches!(
        r.save(q.clone(), "one").outcome,
        SaveOutcome::Saved { .. }
    ));
    assert!(r.inspect(&o.session_id, o.epoch, "one").unwrap().is_none());
    let candidate = r
        .reload(&o.session_id, o.epoch, Some(revision.clone()), "one")
        .unwrap();
    assert_eq!(candidate.epoch, o.epoch);
    let committed = r
        .commit_reload(&o.session_id, o.epoch, revision, "one")
        .unwrap();
    assert_eq!(committed.epoch, o.epoch + 1);
    assert!(matches!(
        r.save(q, "one").outcome,
        SaveOutcome::Failed { .. }
    ));
    fs::remove_file(p).unwrap();
    assert!(matches!(
        r.save(request(&committed, "new"), "one").outcome,
        SaveOutcome::Conflict { disk: None }
    ));
}
#[test]
fn restore_recovery_preserves_format_retains_original_and_claims_live_record() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("original");
    fs::write(&p, b"\xef\xbb\xbfhello\r\n").unwrap();
    let registry = Registry::new(d.path().join("data"));
    let opened = registry.open(&p, "one").unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let mut draft = snapshot(&opened, &id, 8);
    draft.text = "unsaved\r\n".into();
    registry.write_recovery(draft, "one").unwrap();
    assert!(registry.restore_recovery(&id, "two").is_err());
    registry.release(&opened.session_id, "one").unwrap();
    let restored = registry.restore_recovery(&id, "two").unwrap();
    assert!(restored.path.is_none());
    assert_eq!(restored.format, opened.format);
    assert_eq!(restored.text, "unsaved\r\n");
    assert!(registry.list_recovery().unwrap().snapshots.is_empty());
    assert!(registry.restore_recovery(&id, "three").is_err());
    let target = d.path().join("restored");
    let saved = registry
        .save_as(request(&restored, &restored.text), &target, "two")
        .unwrap();
    assert!(matches!(saved.reply.outcome, SaveOutcome::Saved { .. }));
    assert_eq!(fs::read(target).unwrap(), b"\xef\xbb\xbfunsaved\r\n");
    assert!(
        d.path()
            .join("data/recovery")
            .join(format!("{id}.json"))
            .exists()
    );
}
#[test]
fn recovery_discard_respects_live_owner() {
    let d = tempfile::tempdir().unwrap();
    let r = Registry::new(d.path().into());
    let o = r.create("owner").unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    r.write_recovery(snapshot(&o, &id, 1), "owner").unwrap();
    assert!(r.discard_recovery(&id).is_err());
    assert!(r.discard_recovery_owned(&id, "other").is_err());
    r.discard_recovery_owned(&id, "owner").unwrap();
}
#[test]
fn hardlink_alias_activates_existing_owner() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("original");
    let alias = d.path().join("alias");
    fs::write(&p, "same").unwrap();
    fs::hard_link(&p, &alias).unwrap();
    let r = Registry::new(d.path().join("data"));
    r.open(&p, "one").unwrap();
    assert_eq!(r.owner_for_path(&alias), Some("one".into()));
    assert!(r.open(&alias, "two").is_err());
}
fn await_disk_event(registry: &Registry, opened: &Opened, kind: &str) -> DiskEvent {
    await_disk_event_owned(registry, opened, kind, "owner")
}
fn await_disk_event_owned(
    registry: &Registry,
    opened: &Opened,
    kind: &str,
    owner: &str,
) -> DiskEvent {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(4);
    loop {
        if let Some(event) = registry
            .inspect(&opened.session_id, opened.epoch, owner)
            .unwrap()
            && event.kind == kind
        {
            return event;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "notify did not deliver {kind} before fallback deadline"
        );
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
}
#[test]
fn parent_watch_detects_atomic_replacement_delete_and_reappearance() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("doc");
    fs::write(&p, "old").unwrap();
    let r = Registry::new(d.path().join("data"));
    let o = r.open(&p, "owner").unwrap();
    r.inspect(&o.session_id, o.epoch, "owner").unwrap();
    let replacement = d.path().join("replacement");
    fs::write(&replacement, "new").unwrap();
    fs::rename(replacement, &p).unwrap();
    let changed = await_disk_event(&r, &o, "changed");
    assert_ne!(changed.revision, o.revision);
    fs::remove_file(&p).unwrap();
    let missing = await_disk_event(&r, &o, "missing");
    assert!(missing.event_seq > changed.event_seq);
    assert!(!p.exists());
    fs::write(&p, "back").unwrap();
    let returned = await_disk_event(&r, &o, "changed");
    assert!(returned.event_seq > missing.event_seq);
    assert!(matches!(
        r.save(request(&o, "ours"), "owner").outcome,
        SaveOutcome::Conflict { .. }
    ));
}
#[test]
fn save_as_switches_parent_watch() {
    let d = tempfile::tempdir().unwrap();
    let other = d.path().join("other");
    fs::create_dir(&other).unwrap();
    let r = Registry::new(d.path().join("data"));
    let o = r.create("owner").unwrap();
    let p = other.join("doc");
    let opened = r.save_as(request(&o, "saved"), &p, "owner").unwrap().opened;
    r.inspect(&opened.session_id, opened.epoch, "owner")
        .unwrap();
    fs::write(&p, "outside").unwrap();
    assert_eq!(
        await_disk_event(&r, &opened, "changed")
            .revision
            .unwrap()
            .size,
        7
    );
}
