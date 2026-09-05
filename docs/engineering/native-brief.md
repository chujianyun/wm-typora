# Native foundation implementation brief

Work only in crates/document-core (and its Cargo manifest). Read existing types.rs and codec.rs FIRST as binding IPC types. Codec already has 5 passing tests.
Implement coherent native persistence subsystem corresponding to plan Tasks 5,6,8,9; root implements frontend and Tauri shell concurrently. Do not alter root Cargo.toml or frontend. No subagents. Do not commit (shared staging contains root's abandoned-code deletions).

API REQUIRED for root integration:
- Registry::new(data_dir: PathBuf) -> Self
- Registry::create(owner: &str) -> Result<Opened, CoreError>
- Registry::open(path: &Path, owner: &str) -> Result<Opened, CoreError> (trusted native dialog/OS event entry only)
- Registry::save(req: SaveRequest, owner: &str) -> SaveReply
- Registry::save_as(req: SaveRequest, path: &Path, owner: &str) -> Result<Opened, CoreError> (trusted dialog; update existing session on success; same sessionId/epoch so editor history survives; return current saved text and revision)
- Registry::inspect(session_id: &str, epoch: u64, owner: &str) -> Result<Option<DiskEvent>,CoreError> (read-only observation; no baseline mutation; monotonic sequence, dedup observations; called every 750ms by frontend until notify shell wired)
- Registry::reload(session_id: &str, epoch: u64, expected: Option<Revision>, owner: &str) -> Result<Opened,CoreError> (must not mutate epoch/baseline yet; returns candidate; root frontend needs race guard then commit_reload)
- Registry::commit_reload(session_id: &str, epoch: u64, expected: Revision, owner: &str) -> Result<Opened,CoreError> (re-read expected then install epoch+1)
- Registry::release(session_id: &str, owner: &str) -> Result<(),CoreError>
- Registry::owner_for_path(path: &Path) -> Option<String> (used to activate existing window)
- Registry::write_recovery(snapshot: RecoverySnapshot, owner:&str) -> Result<u64,CoreError>
- Registry::list_recovery() -> Result<RecoveryList,CoreError>
- Registry::discard_recovery(recovery_id:&str) -> Result<(),CoreError>

Separate modules registry.rs, atomic_save.rs, recovery.rs, grants.rs/platform if useful. Re-export Registry in lib.rs. Thread safe interior Mutex; don't hold root mutable borrow requirements. Owner/session grants prevent forged paths/epochs. Validate codec/size, reject symlink swaps and identity changes, never unconditional overwrite changed external file. Save request expected must match stored baseline AND current disk. Same bytes unchanged skip write and mtime; response request/epoch/version exact; repeated ID idempotent but reject changed payload for same ID. Persisted snapshots may be stale buffer revisions while latest buffer stays dirty in frontend.

Atomic save: same-dir temp, full flush, preserve unix modes and xattrs, backup prior bytes in data dir, final revision recheck, replace WITHOUT deleting original first. New destinations must use no-clobber. Windows replace uses ReplaceFileW where existing. Post-commit failure = saved uncertain, no blind retry. Include actual fault injection tests (test-only internal seam). Recovery UUID path validation, checksum envelope, reject older versions, atomic private files, list isolates corrupt entries and warns; only own session may write snapshot, validate sourcePath from session not trusted caller. Released sessions must not accept stale writes.

Use test-first assertions, run meaningful real tempfile tests for unauthorized owner, symlink replacement, no-op saves, conflict, BOM/CRLF, save-as failure/cancel identity preservation, recovery invalid ids/checksum/old versions, reload race, missing files. Read source spec sections 6–7 if needed but avoid broad unrelated UI plan. Full report to docs/engineering/native-report.md with RED/GREEN commands and limitations; concise result to root. Send root API ready notice early.
