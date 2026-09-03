# WTypora Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and start the first usable macOS version of WTypora, a local-first single-pane Markdown desktop editor, from the approved design.

**Architecture:** A React shell owns presentation while focused TypeScript modules own document, workspace, export, preferences, and editor contracts. `DocumentSession` is the only owner of Markdown state; editor adapters exchange plain Markdown, and a typed `NativeBridge` is the only frontend boundary to Tauri commands. Rust commands enforce allowed roots and implement atomic local file operations.

**Tech Stack:** Tauri 2, Rust stable >= 1.77.2, React, TypeScript, Vite, Zustand, Milkdown Crepe, CodeMirror 6, Mermaid, KaTeX, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-04-wtypora-design.md`

## Global Constraints

- Local-first: application code must not upload document content or images.
- Disk format and editor interchange format are always Markdown strings.
- Autosave delay is exactly 800 ms and only named documents are written automatically.
- Mermaid uses `securityLevel: "strict"`, `startOnLoad: false`, bounded `maxTextSize` and `maxEdges`, with no click callbacks.
- Exported HTML contains no executable script, inline event handler, iframe, or unsafe URL.
- macOS is the primary runtime target; Windows and Linux source/build configuration remains portable.
- New business behavior is introduced through a witnessed red-green test cycle.

---

### Task 1: Toolchain and application skeleton

**Files:** `package.json`, Vite/TypeScript configs, `index.html`, `src/main.tsx`, `src/app/App.tsx`, styles, test setup, and the Tauri crate/configuration.

**Interfaces:** Produces `npm run dev`, `npm test`, `npm run build`, `npm run tauri dev`, and a `WTypora` Tauri binary.

- [x] Add a smoke test that renders the application root and expects the title `WTypora`.
- [x] Run it and verify it fails because the shell is absent.
- [x] Add the minimal Vite/React/Tauri skeleton, test configuration, and semantic design tokens.
- [x] Run the focused smoke test and verify it passes.

### Task 2: Document model, statistics, outline, and autosave

**Files:** `src/document/{types,documentStore,autosave,statistics}.ts`, `src/workspace/outline.ts`, and focused tests.

**Interfaces:** Produces `useDocumentStore`, `scheduleAutosave(save, delay = 800)`, `calculateStatistics(markdown)`, and `buildOutline(markdown)`; `DocumentState` contains all fields named in the spec.

- [x] Write focused tests for state transitions, hand-derived statistics, heading hierarchy, and the 800 ms timer.
- [x] Run those tests and verify each fails for missing behavior.
- [x] Implement the smallest pure functions and Zustand transitions satisfying the contracts.
- [x] Run focused and complete frontend suites.

### Task 3: Typed native bridge and Rust filesystem commands

**Files:** `src/native/*`, `src-tauri/src/{error,state}.rs`, `src-tauri/src/commands/*`, browser bridge tests, and Rust tests.

**Interfaces:** Produces bridge methods for file/workspace dialogs, reads, atomic writes, image copies, and HTML export. Rust returns `{ code, message, path }` errors and constrains operations to granted roots.

- [x] Write frontend contract tests and Rust tests for reads, filtering, root checks, atomic replacement, and image collision names.
- [x] Run Vitest and `cargo test`; verify missing-behavior failures.
- [x] Implement browser-local fallbacks, Tauri invokes, and guarded Rust commands.
- [x] Run focused suites and verify they pass.

### Task 4: Editors and Markdown-preserving mode switching

**Files:** `src/editor/{EditorAdapter,VisualEditor,SourceEditor,EditorPane}.*` and contract/component tests.

**Interfaces:** Produces `EditorAdapter { getMarkdown, setMarkdown, focus, getCursor }`; both controlled editors call `onChange(markdown)` and mode changes never translate through HTML.

- [ ] Write shared contract/component tests proving edit updates and verbatim mode switching.
- [ ] Run tests and witness missing-editor failures.
- [ ] Implement Crepe and CodeMirror lifecycle adapters.
- [ ] Run editor and full frontend suites.

### Task 5: Application shell, workspace, find, preferences, and recovery

**Files:** app command hook, title/sidebar/find/status/dialog components, workspace/preferences stores, recovery module, and interaction tests.

**Interfaces:** Produces the five-zone UI, semantic commands, recent items, theme/editor/writing settings, and local recovery drafts.

- [ ] Write interaction tests for sidebar tabs, file opening, mode toggle, find/replace, save prompt, and recovery.
- [ ] Run tests and verify expected missing-UI failures.
- [ ] Build accessible focused components and wire shortcuts through one command hook.
- [ ] Run component and complete frontend suites.

### Task 6: Mermaid rendering and safe HTML/PDF export

**Files:** `src/editor/{MermaidBlock,mermaid}.*`, `src/export/{sanitize,buildHtml,print}.ts`, and focused tests.

**Interfaces:** Produces `renderMermaid`, `sanitizeExportHtml`, `buildHtmlDocument`, and `printDocument`.

- [ ] Write tests for strict Mermaid configuration, errors, inline SVG, math CSS, and unsafe HTML removal.
- [ ] Run focused tests and witness feature-missing failures.
- [ ] Implement bounded Mermaid rendering and static export generation.
- [ ] Run focused and complete frontend suites.

### Task 7: Integration, packaging, and startup

**Files:** integrated app/style/config updates and `README.md`.

- [ ] Run frontend tests, typecheck, lint, production build, and Rust tests from clean invocations.
- [ ] Fix only evidence-backed integration failures and rerun complete commands.
- [ ] Build a debug desktop bundle.
- [ ] Start Tauri dev, confirm the process reaches running state, and leave it available.
- [ ] Record exact commands, requirements, scope, and manual smoke checks in `README.md`.
