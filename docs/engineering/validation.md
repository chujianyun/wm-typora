# Foundation verification · 2026-09-05

Scope: new `apps/desktop`, `crates/document-core`, fixtures and tooling on `codex/wtypora-foundation`. Not a certification of the full redesign Spec or a production release.

## Environment and reproducible checks

Apple M5, 32 GiB RAM, macOS 26.6.2 (25G83), aarch64; Node 26.8.1; Rust 1.98.1. Dependency lockfiles are checked in.

| Command | Actual result |
| --- | --- |
| `npm run check` | Exit 0 after final source fixes; runs all rows below through Clippy |
| `node scripts/verify-corpus.mjs` | 10 SHA-256 checks pass; fixture creation never updates existing expectations |
| `npm run format:check` / `npm run typecheck` / `npm run lint` | Exit 0 |
| `npm test` | 7 files, 31 tests pass |
| `npm run build` | Exit 0; editor vendor chunk ~527 kB still warns above Vite's 500 kB threshold |
| `cargo fmt --all -- --check` | Exit 0 |
| `cargo test --workspace --locked` | 26 pass, 1 child-only harness listed ignored and actually launched 3 times by the parent test; desktop shell has no Rust unit tests |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | Exit 0 |
| `npm run e2e` | Chromium 3 + WebKit 3 pass; two opt-in performance entries skipped by design |
| `WTYPORA_PERF=1 npm run e2e -- --project=chromium` | Exit 0, 4 tests pass; performance sampling executed separately from the default skipped entries |
| `npm audit --json` | Exit 0; 0 reported npm vulnerabilities; no Cargo advisory scan performed |
| `npm run tauri -w @wtypora/desktop -- build --debug --bundles app` | macOS app bundle produced successfully; no distribution signing/notarization |
| `git diff --check` / `git diff --cached --check` | Exit 0; byte fixtures explicitly disable text normalization and allow intentional whitespace |

Earlier non-green checks were addressed, not concealed: corpus test URL resolution failed under jsdom and was corrected; menu accessible name prevented Save locator matching and was corrected; session stale-version regression failed behaviorally before the version check was added; Rust shell formatting/Clippy violations were corrected. WebKit download suffered connection reset and missing-engine failures; final installed engine run passed.

Visual screenshot review additionally caught CodeMirror's generated base-theme specificity overriding the intended content margin/padding and scroller line-height. Browser regressions first failed on x=0 instead of x=260 and 21px instead of 28.5px line-height. Scoped editor selectors now preserve the 760px centered column, 60px desktop top space, narrow-window padding and dark canvas. Both Chromium/WebKit layout assertions pass. `evidence/source-preview.png` is synthetic browser preview content, not the user's native document.

## What the tests prove

Frontend: LF/CRLF/unknown syntax retention, mixed/CR readonly, versioned saved/dirty/conflict/error state, stale/duplicate replies, composition-aware autosave, recovery queue timing, save-as cancellation, failed close/discard, restore locking/ownership cleanup, working editor and explicit preview. Browser E2E checks source edit/save/edit/cancel-close and undo/find, not real filesystem or native menu routing.

Rust: strict codec, no-op revision, owner checks, symlink swap rejection, hardlink identity, same-directory save, original bytes under precommit fault, uncertain result after commit fault, bounded receipts/backups, recovery corruption/version/owner isolation, two-phase reload, real directory notifications/replacement/deletion/reappearance, and real killed subprocesses at three recovery checkpoints. Details: `native-report.md`.

## Native UI status — incomplete

The bundled app launched and a real WKWebView displayed a native file window with the source editor/status bar. On attempting to start an isolated test document, computer-use reported user activity; further system UI operations were paused to avoid touching the user's current document. No user document was edited for testing.

Still required before marking stage 1 accepted: Chinese IME candidate/composition/undo; native Open cancellation; Save to Chinese/space path and byte-level reopen; Finder reopening the same file; external-change conflict while editing; dirty/error/untitled close; independent two-window close; full-app force-quit and recovery. Killed-core-process tests do not substitute for this integration matrix. Native tabs are not implemented or validated.

Three-platform CI is defined in `.github/workflows/foundation.yml` but has not been pushed or executed remotely. Windows identity/ReplaceFile/directory durability and Linux WebKit behavior remain unverified. Do not describe this as three-platform acceptance.

## Performance characterization (not a release gate pass)

Raw reproducible measurements, hardware, browser version and sample hashes: `evidence/browser-performance.json`. This is Chromium with Vite development code and a FakeBridge. Fresh contexts are not OS cold launches; WebKit/native/file-I/O latency and release performance are not measured.

| Probe | n | median ms | p95 ms | p99 ms |
| --- | --- | --- | --- | --- |
| First five fresh-context load-to-editor-ready | 5 | 134.40 | 151.12 | 151.12 |
| Following twenty fresh-context load-to-ready | 20 | 96.40 | 108.08 | 108.08 |
| 100,000-line synchronous dispatch | 1,000 | 49.10 | 59.80 | 68.60 |
| Empty-document beforeinput to next animation frame | 1,000 | 8.40 | 15.80 | 17.10 |

1 MiB buffer installation + two animation frames: 46.2 ms; 100,000-line installation: 61.5 ms (one sample each, not percentile claims). The large fixture consists of successive nonblank lines (a very large Markdown paragraph). Its dispatch result exposes a long-document cost requiring investigation before a publishing-grade performance claim. The input-to-frame probe includes synthetic browser keyboard events and is not native IME or end-to-display latency.

## Next gates

1. Resume the isolated native UI acceptance matrix when the user is not interacting with the app; do not force-quit a process holding their documents.
2. Execute the configured Windows/Linux/macOS CI in an authorized remote workflow.
3. Investigate 100k-line paragraph dispatch; collect native release cold/warm startup and actual input latency under the Spec's budget.
4. Proceed to the separate live-preview milestone only after the foundation's native safety checks are recorded. Retain source buffer and unknown syntax; do not replace the source model with generated Markdown.
