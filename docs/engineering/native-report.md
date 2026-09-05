# Native persistence foundation report

Implemented Registry from native-brief.md, using a Mutex-owned session registry. Owners and epochs are checked before document/recovery writes. Paths enter through trusted open/save-as calls; later saves use stored paths and revisions. Per root's later request, save_as returns SaveAsResult {opened, reply} to expose durability, and restore_recovery(id, owner) creates an untitled session with exact verified recovery text/format.

## Implemented

- Open/create/release, owner lookup, UTF-8/BOM and exact LF/CRLF preservation, read-only codec enforcement, 32 MiB input bounds.
- Ordinary saves compare request baseline to stored baseline and current disk hash/size/mtime/identity. Same bytes skip replacement and retain revision/mtime. Request ID replay returns the original response; changed payload reuse is rejected. Save-as preserves session/epoch and has its own replay receipt.
- Same-directory temporary writes, file sync, Unix permission and xattr preservation, private prior-byte backups, final revision check, atomic replacement without deleting original. New destinations use no-clobber. Windows branch uses ReplaceFileW and handle-derived file identity.
- After replacement, failed verification or directory flush yields Saved with durability=uncertain. No post-commit ordinary-save error invites a blind retry.
- Inspect observes without changing saved baseline, deduplicates changed/missing/unreadable states, and emits monotonic sequence numbers. Reload returns a candidate without changing epoch; commit_reload rereads the expected revision and then increments epoch. Frontend must prevent user edits between commit request and installation.
- Recovery snapshots use canonical UUID filenames, checksum/schema envelopes, atomic private temp files, session validation, authoritative source path/revision/format, and monotonic epoch/version validation. Listing isolates corrupt entries, warns, and excludes active sessions. Release revokes pending writes. Recovery parsing accounts for JSON expansion of valid document text.

## Test evidence

Actual RED before implementation: `cargo test -p wtypora-document-core --test persistence` failed with four unresolved Registry API references.

Second behavioral RED: the save-as replay test failed with a baseline conflict on the repeated request. Added save-as receipts; test passed.

Third behavioral RED: the active-recovery exclusion assertion failed. Added filtering against live session IDs; test passed.

GREEN: `cargo test -p wtypora-document-core` passes codec tests and real temporary-file persistence tests. Coverage includes unauthorized owner, symlink replacement, unchanged revision, conflict, missing file, BOM/CRLF, failed save-as preserving original identity, no-clobber target, replay/payload rejection, Unix mode/xattr preservation, reload race, recovery invalid UUID/checksum/old version/corrupt-entry isolation/live-session exclusion/released-session denial. An internal injected pre-commit fault verifies original bytes remain; an injected post-commit fault verifies new bytes exist with uncertain durability. `cargo clippy -p wtypora-document-core --all-targets -- -D warnings` passes on macOS.

## Limits requiring explicit disclosure

- A portable revision check followed by rename is not filesystem compare-and-swap: a narrow race remains if another process modifies/replaces the target after final verification but before replacement. The implementation rejects observed conflicts and identity/symlink swaps; it does not prove protection from an adversarial concurrent writer in this final interval.
- Only aarch64-apple-darwin was compiled and executed. Windows replacement/identity code is present but unvalidated on Windows; directory flush may yield uncertain there. No claim of Windows release readiness.
- Save-as refuses unrelated existing destinations because its API carries no expected target revision. A native overwrite confirmation alone is insufficient to authorize a safe revision-based overwrite.
- Save-as now returns SaveAsResult with both session state and correlated durability-bearing reply. Original recovery remains on disk until the shell explicitly discards it after a successful save; a live restored session claims and hides the original record from other windows.
- Recovery writes sync the file and containing directory/data ancestors; directory flush failure returns error code `durability` and must block a close claiming successful recovery. Same-version retries reflush directories. Recovery deletion also flushes the directory. Application-private permissions are explicitly set on Unix; Windows ACL hardening remains unvalidated.
- Registry now watches the non-recursive parent directories of live document paths with `notify`. The shell's existing 750 ms inspect timer transports observations; quiet ticks skip file reads. A shared atomic generation invalidates observations on write/rename/delete events; Access events are ignored. Watch setup/errors disable caching and fall back to full inspection. A 5-second reconciliation interval catches missed notifications. Session locking still serializes disk work and is not yet tuned for many simultaneously large documents; any watched-directory event invalidates all sessions, so unrelated writes can cause extra reads.
- Request receipts retain the latest 128 combined save/save-as requests, SHA-256 payload digests, and compact responses. Save-as receipts reconstruct text from the verified retry rather than retaining another buffer. Evicted IDs lose replay guarantees; receipts are not persisted across restart. Save-as failures do not create receipts.
- Backups are grouped by canonical path hash and pruned to `BACKUPS_PER_DOCUMENT = 20` after a flushed backup is installed. This policy does not delete recovery snapshots. No backup restoration UI, global disk quota, or migration/pruning of the old flat backup layout is included.
- Hard-link aliases use current file identity for owner lookup and duplicate-open rejection. Atomic replacement changes identity and naturally breaks a hard-link relationship; link preservation is not provided.

Fourth behavioral RED: restored recovery remained available to another window. Added live recovery claims so listing hides it and a second restore is rejected; the original disk record remains untouched.

Follow-up hardening added owner-aware `discard_recovery_owned(id, owner)`; the legacy method refuses all live-owned records, and the owned method refuses another window's snapshot or restored-record claim. The new API test first failed to compile before implementation. Additional tests verify hard-link aliases, 128-receipt bound, 20-backup bound, and injected recovery-directory flush failure followed by safe same-version retry. No-op saves now flush existing file/directory before reporting confirmed durability, retaining mtime and avoiding replacement.

Notify integration reconciles watch registrations on successful open/save-as/release, so abandoned parent directories are unwatched. No public IPC API change is required. Notifications only trigger authoritative disk observation; saves/reload always validate actual hash/identity regardless of cache state. Delete and transient absence never recreate a file or mutate the baseline. A notification arriving during hashing remains pending because its generation is captured before the read. Windows notify behavior remains unvalidated locally.

Real-file tests wait at most 4 seconds (shorter than the 5-second fallback) for native notification, atomic replacement, deletion/reappearance, and save-as directory changes. A unit assertion confirms the native generation actually changes, quiet inspection keeps its prior full-read timestamp, and elapsed reconciliation performs another read. The previous immediate-after-delete test initially failed under asynchronous notification; it now uses the same bounded eventual assertion.

## Real process termination and recovery restart

Added a `cfg(test)`-only thread-local checkpoint callback. No hook or environment configuration is compiled into production persistence. A parent unit test launches the unit-test executable with the normally ignored child harness, waits up to 8 seconds for a checkpoint marker, then forcibly kills and waits for that process. Each stage uses a fresh temporary directory and an already confirmed version 1 recovery record.

- After the version 2 temp file is fully written but before file sync: restart lists and restores exact version 1.
- After temp-file sync but before rename: restart lists and restores exact version 1.
- After rename plus recovery/data/parent directory sync, at the confirmed checkpoint: restart lists and restores exact version 2.

Every stage asserts exactly one valid visible record, no corruption warnings, the expected version, complete Unicode text, and preserved BOM/CRLF format. Orphan temp files never become recovery records. The parent checks non-successful child termination and instantiates a fresh Registry after the kill. The ignored worker is executed by the parent for all three stages during a normal test run; its ignored status does not mean crash coverage was skipped.

Actual RED: `cargo test -p wtypora-document-core --lib killed_child_restart` failed because the checkpoint seam did not exist. GREEN after adding test-only checkpoints: `cargo test -p wtypora-document-core --lib killed_child_restart -- --nocapture` passed, including all three killed subprocesses (0.14 seconds locally). Full core suite and Clippy are also run after the change.

This verifies process termination on local macOS, not sudden power loss, filesystem/device cache guarantees, or Windows termination behavior. It does not stop inside an individual OS write, inside rename, or in the interval after rename but before directory sync; that unconfirmed interval may legitimately expose either complete version after a real crash and remains untested here. Existing returned-error directory-flush tests remain intact.

Final native count: 26 passing tests including root's corpus test (5 codec, 14 persistence, 6 unit tests, 1 corpus), plus one child-only harness marked ignored in the parent listing. No root Cargo manifest edits, shell/frontend changes, commits, or subagents were performed by this worker. cargo fmt reformatted existing codec/types; the only IPC type addition is SaveAsResult requested by root.
