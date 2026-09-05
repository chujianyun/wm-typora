# Foundation execution · 2026-09-05

Plan: `docs/superpowers/plans/2026-09-05-wtypora-foundation.md`.

Branch: `codex/wtypora-foundation`; worktree: `/Users/wuming/Documents/Coding/my/wtypora-foundation`; base: `main` at `b9af968`.

Only the explicitly abandoned tracked paths (identified by the original checkout's pre-existing deletion list) were removed in this isolated worktree. Old versions remain recoverable at the base commit. No changes, merge, reset, or push were made in the original checkout.

Execution adjustment: tightly coupled frontend/controller integration performed locally; native persistence delegated as a bounded independent implementation under the plan-execution skills, then independently reviewed. Small plan commits consolidated into an integrated foundation checkpoint; review and validation are not inferred from commit boundaries. The approved plan remains an immutable checklist reference; this file records actual status, including partial items.

| Task | Code/test status | Outstanding acceptance |
| --- | --- | --- |
| 1 Workspace | npm/Cargo workspace, app build, check entry implemented | Full native acceptance below |
| 2 Codec/corpus | Exact bytes, 10 fixed SHA-256 checks, native and frontend corpus tests | None for stated UTF-8 formats |
| 3 Single buffer | CM6, source/history/find, readonly formats, 8 corpus cases | Real Chinese IME candidate/composition/undo |
| 4 State machine | Version/epoch/request correlation, stale and duplicate responses, uncertain durability | Broader phase table expansion remains useful |
| 5 Native grants | Registered path/owner/identity, private IPC, symlink/hardlink tests | Windows/Linux actual execution |
| 6 Atomic save | Backups, no-clobber, real temp files, returned-fault tests | Hostile final-check race cannot be eliminated; power-loss coverage absent |
| 7 Autosave | 1s debounce, in-flight latest version, composition guards, disposal tests | Native input-method test |
| 8 External changes | Parent-directory notify + 750ms observation + 5s reconciliation, conflict UI | Native concurrent writer UI scenario |
| 9 Recovery/close | Checksum/version/ownership, 500ms/2s queue, close guards, 3 killed-child checkpoints | Full-app force-quit/restart scenario; intermediate syscall/power failure not covered |
| 10 Desktop workflow | Menu, commands, Finder open event, native dialog, multiwindow code; browser E2E | UI automation paused when user activity was detected; no full native pass claimed |
| 11 Delivery gate | 31 JS + 26 Rust tests, lint/types/fmt/build/Clippy, 6 browser E2E, opt-in performance, CI config | Remote 3-platform CI, native cold/warm startup, release performance/signing |

Independent review found and implementation repaired: restore race, Save As conflict clearing, discard-close recovery failure, restored-record cleanup, and recovery deletion ownership. Focused re-review found no remaining high/critical issue in these paths (source review, not a substitute for rerunning tests).

Current conclusion: integrated foundation checkpoint is testable; stages 0–1 native acceptance is NOT complete. Full Typora-like live preview and later product features have not started in this checkpoint. See `validation.md` for evidence and next gates.
