# WTypora 阶段 0–1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 用户选择委派执行后可改用 superpowers:subagent-driven-development。

**Goal:** 交付能在 macOS 打开、编辑、安全保存和恢复 Markdown 的全新桌面基础版，并在三平台验证正文保真。

**Architecture:** 一个 CodeMirror EditorState 持有可编辑正文，React 订阅会话元数据。Rust 管理文件授权、串行写入、磁盘基线和恢复日志；跨进程使用带请求 ID 与会话代次的消息。阶段 1 只显示源码，后续实时预览复用同一状态和历史。

**Tech Stack:** Tauri 2、Rust stable、TypeScript、React、CodeMirror 6、Lezer Markdown、Vite、Vitest、Playwright、Rust tempfile/proptest/notify/serde/sha2。

**Spec:** `docs/superpowers/specs/2026-09-05-wtypora-redesign.md`。阅读完整方案后，按本计划执行阶段 0–1；不将阶段 2–7 的功能并入本轮。

## Global Constraints

- “WTypora 从零重做，不恢复也不沿用仓库中旧版实现。”
- “Markdown 文本缓冲区是正文的唯一事实来源。”
- “核心版不内置 AI、账号、社区或多人协作。”
- “默认停止输入 1,000ms 后自动保存已命名文档。”
- “默认一份文档一个窗口。”
- “新窗口不展开侧栏。”
- “默认禁止网络请求，不嵌入用户行为追踪 SDK。”
- macOS 首发验收，Windows/Linux 每次变更都编译并运行原生核心测试。
- 节点运行时锁定本机验证过的 Node 26.8.1；Rust 工具链锁定本机验证过的 1.98.1；不沿用已删除的旧 package/Cargo 清单。
- npm 依赖保存为精确版本并提交 package-lock.json；Cargo 提交 Cargo.lock，以 `--locked` 验证；选定版本记录到 `docs/engineering/dependencies.md`。
- 所有步骤里的源码均为待实现内容，不代表当前文件已经存在或测试已经通过。
- 产品 UI 文案不出现 Tauri、Rust、Lezer 等内部实现名称。

## A. 本轮交付及未交付范围

阶段 0 交付全新可启动窗口、测试与 CI 基线。阶段 1 交付新建、原生对话框打开、源码编辑、保存/另存为、自动保存、失败提示、文件变更与冲突、草稿恢复和关闭保护。仅开放 UTF-8/BOM 且换行为统一 LF/CRLF 的文件编辑。

混合换行和独立 CR 先只读打开，保持原始内容，可导出原始字节；不在本轮引入逐行换行映射。无编辑保存必须跳过写入；编辑后撤销回原文也应由后端内容哈希识别为无变化。

不交付：实时预览、表格/公式/图表组件、文件树、全文检索、图片管理、主题安装、阅读/导出管线、系统原生标签页、系统版本浏览、签名公证与自动升级。这些分别属于阶段 2–7。本轮的源码基础版不能标记为“Typora 替代品已完成”。

## B. 仓库边界与实现前置检查

当前基线为 `c3661a9`，大量旧源码处于未暂存删除状态；本计划及本次设计修订是新增工作。未跟踪 `.superpowers/` 和 `.vite/` 是既有本地目录。执行时先记录 `git status --porcelain=v1` 与 `git diff --name-status`，确认是否有新变化。不要用 `git add .`、`git reset --hard` 或从 HEAD 恢复旧版文件。

本计划选择新路径 `apps/desktop/` 和 `crates/document-core/` 实现。这样各任务提交可仅包含明确列出的新文件，旧路径的删除不妨碍新工程验证。根目录仅新增工作区清单、开发说明和 CI 配置。若使用隔离工作树，执行时遵循 using-git-worktrees，先确认实际起点包含本计划和修订后的 spec，不能把工作树中重新出现的旧源码当作新实现基础。

## C. 文件地图

| 文件/目录 | 职责 |
| --- | --- |
| `package.json`, `package-lock.json`, `.node-version` | npm workspace、脚本和固定依赖 |
| `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml` | Rust workspace 和工具链 |
| `apps/desktop/package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `eslint.config.mjs`, `playwright.config.ts` | 新桌面前端构建和检查配置 |
| `apps/desktop/src/app/{App.tsx,commands.ts,commands.test.ts,app.css}` | 无侧栏窗口和统一命令 |
| `apps/desktop/src/editor/{buffer.ts,buffer.test.ts,EditorPane.tsx,EditorPane.test.tsx}` | 单一缓冲区、生命周期 |
| `apps/desktop/src/document/{protocol.ts,session.ts,session.test.ts,saveQueue.ts,saveQueue.test.ts}` | 跨进程类型、版本状态机、自动保存 |
| `apps/desktop/src/document/{recovery.ts,recovery.test.ts,controller.ts,controller.test.ts}` | 恢复调度与打开/保存/关闭流程 |
| `apps/desktop/src/native/{bridge.ts,fakeBridge.ts,bridge.test.ts}` | 类型化 IPC 与测试替身 |
| `apps/desktop/src/components/{ConflictDialog.tsx,RecoveryDialog.tsx,CloseDialog.tsx}` | 用户决策界面 |
| `apps/desktop/src/test/{setup.ts,sessionFixture.ts}` | 测试装配与非正文样本 |
| `apps/desktop/src-tauri/{Cargo.toml,build.rs,tauri.conf.json,capabilities/main.json}` | 新原生壳配置 |
| `apps/desktop/src-tauri/src/{main.rs,lib.rs,commands.rs,windows.rs}` | IPC 装配、会话归属、多窗口 |
| `crates/document-core/src/{lib.rs,types.rs,error.rs,codec.rs}` | 纯 Rust 数据协议与编码 |
| `crates/document-core/src/{grants.rs,registry.rs,atomic_save.rs}` | 授权、会话登记、写入事务 |
| `crates/document-core/src/{watcher.rs,recovery.rs}` | 外部变更与耐久恢复 |
| `crates/document-core/src/platform/{mod.rs,unix.rs,windows.rs}` | 替换、文件身份、刷新差异 |
| `crates/document-core/tests/{codec.rs,save.rs,grants.rs,watcher.rs,recovery.rs}` | 真实文件系统集成测试 |
| `tests/corpus/{manifest.json,utf8-lf.md,utf8-crlf.md,utf8-bom.md,mixed.md,invalid.bin}` | 确定性字节样本 |
| `scripts/{create-corpus.mjs,verify-corpus.mjs}` | 样本生成与哈希校验 |
| `apps/desktop/e2e/{editor.spec.ts,recovery.spec.ts}` | 浏览器编辑与 UI 行为 |
| `.github/workflows/foundation.yml` | 三平台测试和构建 |
| `docs/engineering/{dependencies.md,foundation-validation.md,macos-smoke.md}` | 依赖记录、证据和原生验收 |

## D. 协议与状态规则（任务共享）

以下类型完整定义于 `apps/desktop/src/document/protocol.ts`；Rust 同名结构用 `serde(rename_all = "camelCase")`。字节长度是 UTF-8 字节数，编辑器位置是 UTF-16 偏移；不在两者间直接复用位置。

```ts
export type Format = { encoding: 'utf-8' | 'utf-8-bom'; eol: 'lf' | 'crlf' | 'mixed' | 'cr' };
export type Revision = { hash: string; size: number; modifiedAtNs: string; identity: string };
export type SessionKey = { sessionId: string; epoch: number };
export type Failure = { code: 'permission' | 'io' | 'encoding' | 'conflict' | 'stale' | 'limit'; message: string };
export type Opened = SessionKey & {
  path: string | null; text: string; format: Format;
  revision: Revision | null; readOnly: boolean;
};
export type SaveRequest = SessionKey & {
  requestId: string; version: number; text: string; expected: Revision | null;
};
export type SaveReply = SessionKey & {
  requestId: string; version: number;
} & (
  | { kind: 'saved' | 'unchanged'; revision: Revision; durability: 'confirmed' | 'uncertain' }
  | { kind: 'conflict'; disk: Revision | null }
  | { kind: 'failed'; error: Failure }
);
export type DiskEvent = SessionKey & {
  eventSeq: number;
  kind: 'changed' | 'missing' | 'unreadable'; revision: Revision | null;
};
export type RecoverySnapshot = SessionKey & {
  recoveryId: string; version: number; text: string; format: Format;
  sourcePath: string | null; sourceRevision: Revision | null; updatedAt: string;
};
export type SavePhase = 'clean' | 'dirty' | 'saving' | 'conflict' | 'error';
export type Session = SessionKey & {
  path: string | null; format: Format; readOnly: boolean;
  version: number; persistedVersion: number; revision: Revision | null;
  phase: SavePhase; lastDiskEventSeq: number;
  activeRequest: SaveRequest | null; error: Failure | null;
};
```

`activeRequest.text` 是单次在途保存不可变快照，完成即释放；它不接受用户编辑，不在 React 里复制正文。`Session.version` 从 0 开始且只随正文 transaction 增加；显示模式切换、选区变化、语法分析不增加版本。`epoch` 在同一窗口装载不同文档或采用外部全文时增加，取消旧任务并让旧响应失效。

`expected` 由前端回送，但后端必须与自身登记基线核对，不能让前端伪造新基线取得覆盖权限。后端根据 sessionId 获取路径和格式；保存消息不接受任意路径。新路径只来自后端原生保存对话框。

## Task 1: 可启动的新工程与验证入口（阶段 0）

**Files:** 创建 C 节列出的根清单、前端构建与检查配置、`App.tsx`/`app.css`、`apps/desktop/src/main.tsx`、原生壳配置和入口、`crates/document-core/{Cargo.toml,src/lib.rs}`、测试 setup、dependencies.md；重新编写根 `.gitignore`，仅忽略 node_modules、target、dist、.superpowers、.vite、测试产物，不恢复旧文件内容。

**Interfaces:** 产出 npm workspace `@wtypora/desktop`、Rust package `wtypora-document-core` 和 `wtypora-desktop`；App 提供带可访问名称“文档编辑器”的挂载区。此任务无前置业务接口。

- [ ] 创建 workspace 清单，根 `private: true`、`workspaces: ["apps/desktop"]`。根脚本定义如下，桌面包对应定义 `dev: vite --host 127.0.0.1 --port 1420`、`build: tsc --noEmit && vite build`、`test: vitest run`、`typecheck: tsc --noEmit`、`lint: eslint src e2e`、`e2e: playwright test`、`tauri: tauri`。

```json
{
  "scripts": {
    "dev": "npm run dev -w @wtypora/desktop",
    "test": "npm test -w @wtypora/desktop",
    "typecheck": "npm run typecheck -w @wtypora/desktop",
    "lint": "npm run lint -w @wtypora/desktop",
    "build": "npm run build -w @wtypora/desktop",
    "e2e": "npm run e2e -w @wtypora/desktop"
  }
}
```

- [ ] 在桌面包安装 React、ReactDOM、CodeMirror state/view/commands/lang-markdown、Lezer Markdown、Tauri API；开发依赖安装 TypeScript、类型声明、Vite、React 插件、Vitest、jsdom、Testing Library、Playwright、ESLint、TypeScript ESLint、Tauri CLI。使用 `npm install --save-exact`，读取选定包的 engines，跑构建验证后在 dependencies.md 记录版本与用途。Rust workspace 明确 members，桌面包通过 path 引用核心包，不能引用旧 `src-tauri`。vitest 使用 jsdom、setupFiles；ESLint 使用 TypeScript 推荐配置；Playwright 使用 Chromium/WebKit 两项目与 loopback webServer，各配置在此任务建立，Task 11 扩充为完整交付检查。
- [ ] 编写 `EditorPane.test.tsx` 的首个失败测试，确认缺少组件行为造成失败。

```tsx
it('starts with a document surface and no sidebar', () => {
  render(<App />);
  expect(screen.getByLabelText('文档编辑器')).toBeVisible();
  expect(screen.queryByRole('complementary')).toBeNull();
});
```

- [ ] 执行 `npm test -w @wtypora/desktop -- --reporter=verbose`，预期上述断言失败；导入或测试装配错误需先修好，不能作为行为测试证据。
- [ ] 最小 App 返回 `<main aria-label="文档编辑器" />`，后续 Task 3 挂载 CodeMirror。原生 lib 仅创建默认窗口，设置 CSP，生产环境不允许远程页面、shell 或全盘 FS；开发连接仅 loopback。代码配置示意：

```rust
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("desktop runtime failed");
}
```

- [ ] 执行 `npm test`、`npm run typecheck`、`npm run lint`、`npm run build`、`cargo check --workspace --locked`。运行 `npm run tauri -w @wtypora/desktop -- dev`，确认出现空白可聚焦窗口后关闭。记录实际结果。
- [ ] 仅暂存本任务新文件，提交 `chore: establish new desktop workspace`。

## Task 2: 编码、磁盘身份和保真样本

**Files:** 创建 protocol.ts、核心 types.rs/error.rs/codec.rs、tests/codec.rs、corpus、两个 corpus 脚本。修改核心 lib.rs 导出类型。

**Interfaces:** Rust `decode(bytes: &[u8]) -> Result<Decoded, CoreError>` 与 `encode(text: &str, format: &Format) -> Result<Vec<u8>, CoreError>`；`Decoded { text: String, format: Format, read_only: bool }`。文本不包含开头 BOM，保留其余原始字符。TS 使用 D 节协议。

- [ ] 以字节数组创建固定样本，写 manifest 的文件名、原始 SHA-256、格式及只读状态。样本脚本仅在文件不存在时写入，已存在则验证，禁止悄悄刷新期望值。

```js
const cases = {
  'utf8-lf.md': Buffer.from('# 标题\n\n**文本**\n'),
  'utf8-crlf.md': Buffer.from('# 标题\r\n\r\n**文本**\r\n'),
  'utf8-bom.md': Buffer.concat([Buffer.from([239,187,191]), Buffer.from('# 标题\n')]),
  'mixed.md': Buffer.from('one\r\ntwo\nthree\r'),
  'invalid.bin': Buffer.from([255,254,0,216])
};
```

- [ ] 写失败测试，除下例再参数化空文档、无末尾换行、连续空行、孤立 CR、NUL、emoji/组合字符；NUL 拒绝为二进制，混合换行只读。

```rust
#[test]
fn crlf_bom_roundtrip() {
    let input = b"\xEF\xBB\xBF# title\r\n\r\n";
    let decoded = decode(input).unwrap();
    assert!(!decoded.read_only);
    assert_eq!(encode(&decoded.text, &decoded.format).unwrap(), input);
}
```

- [ ] 运行 `cargo test -p wtypora-document-core --test codec`，确认 BOM/EOL 断言失败。
- [ ] 实现：先提取开头 BOM，再 strict UTF-8 解码；一次扫描区分 CRLF/LF/独立 CR；全无换行按 LF。编码只添加声明的 BOM，不使用 `.lines().join()` 或 trim；只读格式拒绝编辑保存。核心动作：

```rust
let (body, bom) = bytes.strip_prefix(&[239, 187, 191])
    .map_or((bytes, false), |body| (body, true));
let text = std::str::from_utf8(body).map_err(CoreError::encoding)?;
```

`CoreError::encoding(error: std::str::Utf8Error) -> CoreError` 在 error.rs 定义，仅返回编码错误码和安全文案，不带正文。
- [ ] 执行 codec 测试和 `node scripts/verify-corpus.mjs`；后者重新计算字节哈希并与 manifest 比较，任意差异退出非零。
- [ ] 提交 `feat: define lossless document codec and corpus`。

## Task 3: 单缓冲区源码编辑器与语法边界

**Files:** buffer.ts/test、EditorPane.tsx/test、App.tsx；新增 `editor/language.ts` 和 `language.test.ts`。

**Interfaces:** `createBuffer(text: string, format: Format, readOnly: boolean): EditorState`；`serialize(state: EditorState): string`；`setDisplayMode(view: EditorView, mode: 'source' | 'live'): void`。本轮 live 仅配置空装饰，不在 UI 暴露；阶段 2 接入真实装饰。`markdownLanguage` 是 language.ts 导出的 Extension。

- [ ] 写失败测试，打开每个可编辑 corpus 样本后序列化，比较完整文本；创建实际 EditorView，执行插入、模式往返、撤销，断言回到原文和相同选区。只读样本断言没有编辑入口。

```ts
it('preserves CRLF in the editor buffer', () => {
  const text = '# A\r\n\r\nbody\r\n';
  const state = createBuffer(text, { encoding: 'utf-8', eol: 'crlf' }, false);
  expect(serialize(state)).toBe(text);
});
```

- [ ] 执行 `npm test -w @wtypora/desktop -- src/editor/buffer.test.ts`，确认默认 EOL 序列化使测试失败。
- [ ] 使用明确 lineSeparator 与 `sliceDoc()`。统一 LF/CRLF 正常编辑；只读混合样本用 LF 作为内部分隔符，原有 CR 留在文本中，不允许保存转换。设置可见只读提示。关键代码：

```ts
const separator = format.eol === 'crlf' ? '\r\n' : '\n';
return EditorState.create({
  doc: text,
  extensions: [
    EditorState.lineSeparator.of(separator),
    EditorState.readOnly.of(readOnly),
    history(), markdownLanguage, displayCompartment.of([])
  ]
});
// serialize
return state.sliceDoc();
```

`displayCompartment` 在 buffer.ts 中由 `new Compartment()` 定义；setDisplayMode 调用它的 reconfigure，不调用 setState。language.ts 使用 `markdown()`，阶段 1 不添加未实现的自定义语法；未知围栏和 HTML 保留为普通文本节点。
- [ ] EditorPane 用 ref 持有 EditorView，useEffect 只按 sessionId/epoch 创建和清理；React rerender 不重设正文。组字时延后显示配置变更到 compositionend。测试 rerender 后 EditorView 身份不变，卸载后监听器被清理。
- [ ] 运行编辑器测试、typecheck，使用中文输入法实际输入一段中文，记录候选窗与撤销结果；DOM 合成事件不代替原生输入法验证。
- [ ] 提交 `feat: add single source editor buffer`。

## Task 4: 会话状态机与保存响应匹配

**Files:** session.ts/test、sessionFixture.ts；实现 D 节类型。

**Interfaces:** `reduceSession(session: Session, event: SessionEvent): Session`；`SessionEvent` 为 `edited(version)`、`saveStarted(request)`、`saveFinished(reply)`、`diskChanged(event)` 四种带 type 判别联合。fixture 的 `makeSession(overrides: Partial<Session>): Session` 默认已打开 LF 空文本文件、version/persistedVersion=0。

- [ ] 写保存期间继续编辑的失败测试；另测旧 requestId、旧 epoch、重复响应、失败保持脏内容、收到磁盘冲突后迟到 saved 不清除冲突。

```ts
it('advances disk baseline without clearing newer edits', () => {
  const request: SaveRequest = {
    sessionId:'s1', epoch:1, requestId:'r1', version:7, text:'v7', expected:null
  };
  const state = makeSession({sessionId:'s1',epoch:1,version:8,persistedVersion:6,
    activeRequest:request,phase:'saving'});
  const revision: Revision = {hash:'h7',size:2,modifiedAtNs:'1',identity:'file1'};
  const next = reduceSession(state,{type:'saveFinished',reply:{...request,
    kind:'saved',revision,durability:'confirmed'}});
  expect(next.persistedVersion).toBe(7);
  expect(next.version).toBe(8);
  expect(next.phase).toBe('dirty');
});
```

- [ ] 执行 `npm test -w @wtypora/desktop -- src/document/session.test.ts`，确认尚无有效基线更新。
- [ ] reducer 对响应先核验 sessionId/epoch/requestId/version 是否匹配 activeRequest；saved/unchanged 更新已保存版本和基线，当前版本不同则 dirty。conflict 持续至明确重载或另存为，失败不得移除正文或恢复数据。

```ts
if (!active || reply.sessionId !== s.sessionId || reply.epoch !== s.epoch ||
    reply.requestId !== active.requestId || reply.version !== active.version) return s;
// saved 分支，已有 conflict 的优先级高于 clean/dirty。
const phase = s.phase === 'conflict' ? 'conflict' :
  (s.version === reply.version ? 'clean' : 'dirty');
```

- [ ] 使用表驱动测试覆盖每个 SavePhase 与四类事件，确保不合法版本倒退被拒绝；运行 typecheck。
- [ ] 提交 `feat: model versioned document save state`。

## Task 5: 后端授权、打开与会话登记

**Files:** grants.rs/registry.rs、tests/grants.rs、原生 commands.rs/windows.rs、bridge.ts/fakeBridge.ts/bridge.test.ts。

**Interfaces:** `NativeBridge.open(): Promise<Opened | null>`；`create(): Promise<Opened>`；`save(request: SaveRequest): Promise<SaveReply>`；`saveAs(request: SaveRequest): Promise<{opened: Opened; reply: SaveReply} | null>`；`subscribe(key: SessionKey, listener: (e: DiskEvent) => void): Promise<() => void>`。后端 `Registry.open_granted(path, window_label) -> Result<Opened, CoreError>`，路径类型 PathBuf。

- [ ] 编写原生测试：授权单文件只允许该文件；未经对话框的兄弟文件拒绝；会话所属 window_label 不符拒绝；授权后符号链接被换向拒绝；两个窗口打开同一文件激活原窗口。unix 用 dev/inode，Windows 用卷与文件 ID；身份不可得时使用规范化路径并保守拒绝歧义。

```rust
#[test]
fn sibling_path_is_not_granted() {
    let dir = tempfile::tempdir().unwrap();
    let a = dir.path().join("a.md");
    let b = dir.path().join("b.md");
    std::fs::write(&a, "A").unwrap();
    std::fs::write(&b, "B").unwrap();
    let mut grants = GrantSet::default();
    grants.allow_file(&a).unwrap();
    assert!(grants.check_file(&a).is_ok());
    assert!(grants.check_file(&b).is_err());
}
```

`GrantSet::{allow_file(&mut self, &Path), check_file(&self, &Path)} -> Result<(), CoreError>` 定义于 grants.rs；allow_file 只从可信原生选择入口调用。
- [ ] 运行 `cargo test -p wtypora-document-core --test grants`，确认未授权路径测试失败。
- [ ] 建立 sessionId 到路径、格式、磁盘身份、所属窗口与 epoch 的登记表；open 读取字节并调用 Task 2 codec。首轮文件尺寸上限 32MiB，超过给出明确 limit 错误，不悄悄截断。首次打开失败不能销毁当前会话。

```rust
// 所有 IPC 命令在读取之前验证调用窗口的会话归属。
let session = registry.for_window(&request.session_id, window.label())?;
grants.check_file(&session.path)?;
```

`Registry::for_window(&self, id: &str, label: &str) -> Result<&NativeSession, CoreError>` 定义于 registry.rs。NativeSession 包含 path、format、revision、epoch，后续 Task 6 加入串行写入锁。
- [ ] bridge 统一映射错误，FakeBridge 使用可控 Promise 模拟取消/延迟/失败，只在测试或开发预览注入；生产初始化失败显示真实错误，禁止自动退回 FakeBridge。
- [ ] 执行原生授权测试、bridge 测试、三平台 cargo check；提交 `feat: enforce native document grants and ownership`。

## Task 6: 原子保存、冲突重验与可恢复提交结果

**Files:** atomic_save.rs、platform 模块、tests/save.rs，更新 Registry 与 IPC save/saveAs。

**Interfaces:** 核心 `save(registry: &Registry, request: SaveRequest, caller: &str) -> SaveReply`；`SaveFault` 测试枚举为 `None/BeforeWrite/BeforeSync/BeforeReplace/AfterReplace`，通过仅测试构造的 `SaveOptions { fault }` 注入。平台层 `replace(temp: &Path, target: &Path) -> io::Result<()>` 与 `sync_parent(target: &Path) -> io::Result<()>`。

- [ ] 写逐阶段故障测试；每次请求都用真实临时目录，不模拟 rename。替换前失败断言旧字节原样，替换后失败断言新字节完整且结果为 saved + uncertain。

```rust
#[test]
fn replacement_failure_keeps_old_bytes() {
    let fixture = SaveFixture::opened(b"old\r\n");
    let reply = fixture.save(b"new\r\n", SaveFault::BeforeReplace);
    assert!(matches!(reply.outcome, SaveOutcome::Failed { .. }));
    assert_eq!(std::fs::read(&fixture.path).unwrap(), b"old\r\n");
}
```

在 tests/save.rs 定义 `SaveFixture::opened(bytes: &[u8]) -> Self`、`save(&self, bytes: &[u8], fault: SaveFault) -> SaveReply`，fixture 自带临时目录、授权和 session，不访问用户目录。
- [ ] 运行 `cargo test -p wtypora-document-core --test save`，确认替换前故障未按预期保留旧字节。
- [ ] 实现串行保存流程：校验窗口和 epoch → 获取每文件锁 → 比较 expected 与注册基线 → 重读并比较磁盘 hash/identity → 编码快照 → 同哈希返回 unchanged → 备份已确认磁盘字节 → 创建同目录随机临时文件 → 完整写入/fsync → 保留可支持元数据 → 再次校验磁盘 → 平台替换 → 目录刷新 → 回读确认 → 更新原生基线。

```rust
use std::io::Write;
let mut temp = tempfile::NamedTempFile::new_in(parent)?;
temp.write_all(&encoded)?;
temp.as_file().sync_all()?;
// 临时文件句柄关闭与权限复制由平台层完成后，再调用 replace。
```

unix 使用同文件系统 rename；Windows 现有文件使用 ReplaceFileW，新文件使用不覆盖已有目标的创建/移动策略。不可用“先删除目标再 rename”。新建路径遭其他进程抢先创建时返回 conflict。路径权限、ACL/xattr 能否完整保留需记录平台测试结果，发现损失不得静默忽略。
- [ ] 保存后目录刷新失败返回 saved/uncertain，界面提示需要确认；禁止自动重试覆盖。保存过程中收到外部变化时标记需重新核对。通用文件系统无法消除最后校验与替换间竞态，保留旧字节恢复副本，不把哈希校验宣称为跨进程 CAS。
- [ ] 增加无修改不写入（mtime 不变）、重复 requestId 幂等、不匹配版本拒绝、两个保存串行、外部写入被检测、BOM/CRLF 重开一致测试；运行 `cargo test -p wtypora-document-core --test save`。
- [ ] 提交 `feat: add recoverable atomic document saves`。

## Task 7: 自动保存队列与组字保护

**Files:** saveQueue.ts/test，连接 controller.ts 的初始保存调度。

**Interfaces:** `createSaveQueue(deps: SaveDependencies): SaveQueue`。deps 含 `getSession(): Session`、`snapshot(): string`、`save(req): Promise<SaveReply>`、`dispatch(event: SessionEvent): void`、`requestId(): string`；queue 提供 `edited()`、`setComposing(boolean)`、`flush(): Promise<void>`、`dispose(): void`。fake timers 控制原生 JS 定时器。

- [ ] 写失败测试：999ms 不保存，1,000ms 保存；组字暂停；在途请求期间只合并最新版本，完成后再发；dispose 后无写入。测试初始化 mock deps 在 saveQueue.test.ts 明确建立。

```ts
it('does not save during composition', async () => {
  vi.useFakeTimers();
  const save = vi.fn().mockResolvedValue({kind:'failed', error:{code:'io',message:'test'}});
  const session = makeSession({path:'/test/a.md', phase:'dirty', version:1});
  const queue = createSaveQueue({getSession:()=>session,snapshot:()=> '中',save,
    dispatch:vi.fn(),requestId:()=> 'r1'});
  queue.setComposing(true); queue.edited();
  await vi.advanceTimersByTimeAsync(1500);
  expect(save).not.toHaveBeenCalled();
  queue.dispose(); vi.useRealTimers();
});
```

- [ ] 运行 `npm test -w @wtypora/desktop -- src/document/saveQueue.test.ts`，确认组字保护失败。
- [ ] 实现单在途锁和 pendingLatest 标志；只有开始实际保存时读取不可变 snapshot，防止缓存旧文本。发送前 dispatch saveStarted，完成后 dispatch saveFinished，再检查最新 dirty。失败和 conflict 暂停重试，需用户显式保存/解决冲突。

```ts
if (disposed || composing || inFlight || session.readOnly || !session.path ||
    session.phase === 'conflict' || session.phase === 'error') return;
const request = {sessionId:session.sessionId, epoch:session.epoch,
  requestId:deps.requestId(), version:session.version,
  text:deps.snapshot(), expected:session.revision};
```

手动 flush 在组字期间排队至 compositionend，在在途保存期间等待并继续保存最新版本；不是直接并行调用 bridge.save。用户显式重试 error 时由 controller 清除错误并进入 dirty，再调用 flush。
- [ ] 运行 fake timer 测试、session 测试、typecheck；确认连续输入只合并计划，不丢最后一版。
- [ ] 提交 `feat: serialize autosave and protect composition`。

## Task 8: 外部变更、冲突与删除保护

**Files:** watcher.rs/test、controller.ts/test、ConflictDialog.tsx、bridge 订阅。

**Interfaces:** 原生 `Watcher::start(session_id, path, emit) -> WatchHandle`、`WatchHandle::stop()`；notify 事件合并 250ms 后重读；无法稳定读到时最多再重试 3 次，每次 250ms，最终发 unreadable。`NativeBridge.reload(key: SessionKey, expected: Revision): Promise<Opened>` 读取指定磁盘版本，否则返回 conflict。

- [ ] 写真实文件监听测试，并给核心判定函数 `classify_disk(baseline, observed) -> DiskClassification` 单元覆盖：相同哈希忽略、内容变化、文件短时缺失后重建、永久删除、读取权限失败。定义 DiskClassification 为 Unchanged/Changed/Missing/Unreadable。

```ts
it('pauses a dirty session on external change', () => {
  const s = makeSession({sessionId:'s1',epoch:1,phase:'dirty',version:2});
  const next = reduceSession(s,{type:'diskChanged',event:{sessionId:'s1',epoch:1,
    eventSeq:1,kind:'missing',revision:null}});
  expect(next.phase).toBe('conflict');
  expect(next.version).toBe(2);
});
```

- [ ] 运行 watcher 和 session 测试，确认缺失文件不能再被自动保存无提示重建。
- [ ] Rust 监听父目录，识别原子替换的新文件身份；发递增 eventSeq，旧序号忽略。clean 自动重载前再检查 version 未变，重载请求带 expected；用户在异步读取期间开始输入则进入 conflict，不能覆盖。

```ts
const before = getSession();
const opened = await bridge.reload(before, event.revision!);
const now = getSession();
if (now.epoch !== before.epoch || now.version !== before.version) {
  enterConflict(event); return;
}
installOpened(opened);
```

`enterConflict(event: DiskEvent): void` 和 `installOpened(opened: Opened): void` 定义于 controller.ts：前者 dispatch diskChanged；后者仅在打开/明确重载完成时替换会话，dispose 旧订阅及队列，epoch 变化后旧响应不生效。
- [ ] 冲突 UI 提供比较、重载、另存为、取消；比较用两份只读快照，原编辑器继续持有内存正文。重载前先写恢复快照，保留取消选项。文件删除后恢复到原路径需显式创建确认，默认建议另存为。
- [ ] 执行 `cargo test -p wtypora-document-core --test watcher` 和前端 controller/session 测试；临时文件风暴用有界最终一致断言，不写无限等待。
- [ ] 提交 `feat: reconcile external changes without losing edits`。

## Task 9: 草稿日志、恢复与关闭事务

**Files:** 两端 recovery、tests/recovery.rs、RecoveryDialog.tsx/CloseDialog.tsx、controller、commands。

**Interfaces:** `NativeBridge.writeRecovery(snapshot: RecoverySnapshot): Promise<{version:number}>`、`listRecovery(): Promise<RecoverySnapshot[]>`、`discardRecovery(recoveryId:string): Promise<void>`；恢复文件 envelope `{schemaVersion:1,payload,checksum}`。`DocumentController.close(): Promise<'closed'|'cancelled'>`。

- [ ] 编写恢复持久性测试：原子写入完成后才确认；较旧版本不能覆盖较新草稿；损坏 checksum 的文件隔离为 `.corrupt` 并仍提供错误说明；一个损坏条目不能阻止其他草稿恢复。

```rust
#[test]
fn older_recovery_cannot_replace_newer() {
    let dir = tempfile::tempdir().unwrap();
    let store = RecoveryStore::new(dir.path());
    store.write(&snapshot(8, "new")).unwrap();
    assert!(store.write(&snapshot(7, "old")).is_err());
    assert_eq!(store.list().unwrap()[0].text, "new");
}
```

`RecoveryStore::{new(&Path), write(&RecoverySnapshot), list(), discard(&str)}` 定义于 recovery.rs；测试 helper `snapshot(version: u64, text: &str) -> RecoverySnapshot` 使用固定合法会话和恢复 ID。
- [ ] 运行 `cargo test -p wtypora-document-core --test recovery`，确认旧快照可覆盖的错误。
- [ ] 恢复日志放应用数据目录，ID 使用 UUID，不接受路径片段。payload 经 serde 序列化后计算 SHA-256，读取按同一字节表示校验。未命名/dirty/error 会话每 500ms 去抖写草稿，持续输入最长 2s 触发一次；只持久化已经提交的组字文本。

```ts
const snapshot: RecoverySnapshot = {
  sessionId:s.sessionId,epoch:s.epoch,recoveryId,version:s.version,
  text:serialize(view.state),format:s.format,sourcePath:s.path,
  sourceRevision:s.revision,updatedAt:new Date().toISOString()
};
await bridge.writeRecovery(snapshot);
```

明确恢复边界：只保证最近已确认持久化快照，异常断电可损失最近约 2 秒及未提交组字；“零丢失”不能由去抖快照保证。日志写入失败在 UI 持续提示。恢复作为新未命名 dirty 文档打开，不能自动覆盖 sourcePath。
- [ ] close 流程：暂停新关闭事件 → 若 dirty 则显示保存/放弃/取消 → 保存等待最新版本及持久性确认 → 若失败或 uncertain 留在窗口 → 放弃由显式操作删除对应草稿 → 成功才释放窗口。保存对话框取消应返回 cancelled。干净窗口可直接关闭。
- [ ] 恢复测试增加真实子进程在写入各点终止，重启验证最近已确认快照；手动关闭 dirty/error/untitled 各一次并记录结果。
- [ ] 提交 `feat: persist recovery snapshots and guard window close`。

## Task 10: 完整源码工作流与 macOS 基础窗口

**Files:** App、commands.ts/test、controller.ts/test、原生 windows.rs/commands.rs、e2e/editor.spec.ts/recovery.spec.ts、macos-smoke.md。

**Interfaces:** `CommandId = 'document.new'|'document.open'|'document.save'|'document.saveAs'|'document.close'|'edit.undo'|'edit.redo'`；`Command {id:CommandId; enabled:()=>boolean; run:()=>Promise<void>|void}`。`DocumentController` 实现 new/open/save/saveAs/close、Task 8 的 installOpened、Task 9 恢复动作；构造时接收 NativeBridge。

- [ ] 写失败测试，按钮、原生菜单和快捷键对同一 command 只执行一次；保存快捷键不干扰 IME。创建两个文档窗口，关闭其中一个不 dispose 另一个会话。

```ts
test('editing survives a cancelled close', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:'新建'}).click();
  await page.locator('.cm-content').fill('# 待保存');
  await page.getByRole('button',{name:'关闭文档'}).click();
  await page.getByRole('button',{name:'取消'}).click();
  await expect(page.locator('.cm-content')).toContainText('待保存');
});
```

上述按钮存在于开发测试壳的可访问命令面板，生产默认使用 macOS 菜单；E2E 明确注入 FakeBridge，不能把浏览器对话框模拟宣称为原生测试。
- [ ] 运行 `npm run e2e -- --project=chromium`，确认关闭保护尚未接通造成失败。
- [ ] controller 将所有命令路由到唯一编辑会话；新建创建新窗口，打开已有规范化文件激活旧窗口。原生 saveAs 只在写入成功后更新 session 路径、基线和 watcher，取消/失败保留原身份。状态栏显示“未保存/保存中/已保存/保存失败/外部冲突/只读”，错误不能只靠颜色表示。

```ts
const saveCommand: Command = {
  id:'document.save', enabled:()=> !getSession().readOnly,
  run:()=>controller.save()
};
```

- [ ] 原生窗口保持系统标题栏、正文 max-width 760px、无默认侧栏。配置 markdown 扩展名关联；基础 Finder 打开事件排队到应用就绪后处理。原生标签页本轮只记可行性结果，不做自绘替代，不声称完成。
- [ ] 执行浏览器 E2E 和 macOS 真应用验收：中文输入与撤销、原生打开取消、保存到带中文/空格路径、Finder 重开、并发外部改写、强制退出后恢复、两个窗口独立关闭。记录测试系统、构建标识与逐项证据。
- [ ] 提交 `feat: integrate source editing desktop workflows`。

## Task 11: 三平台检查、性能基线与交付证据

**Files:** 创建 foundation.yml、`docs/engineering/foundation-validation.md`、`scripts/check-foundation.mjs`；扩充 Task 1 已创建的 `apps/desktop/playwright.config.ts` 和 `apps/desktop/eslint.config.mjs`。

**Interfaces:** `node scripts/check-foundation.mjs` 串行运行检查并在任何子进程失败时非零退出；它不自动提交、安装依赖或修改样本。CI jobs 分别跑 macOS/Windows/Linux。

- [ ] 定义 CI：checkout → Node 26.8.1 → Rust 1.98.1 → 平台 Tauri 前置依赖 → `npm ci` → 完整下列检查。Linux 按 Tauri 官方 prerequisites 安装 GTK/WebKit 构建依赖，不能让缺包失败被标为产品测试通过。

```text
node scripts/verify-corpus.mjs
npm run typecheck
npm run lint
npm test
npm run build
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
```

- [ ] check-foundation 使用 spawnSync，Windows npm 调用 npm.cmd，其余 npm；每条命令 cwd 固定仓库根，遇非零立即退出。关键代码：

```js
import {spawnSync} from 'node:child_process';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
for (const [command,args] of [[npm,['run','typecheck']],[npm,['test']]]) {
  const result = spawnSync(command,args,{stdio:'inherit'});
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
```

在实现中把该数组完整填为上一代码块的八条命令；无需为这个调用封装写镜像单元测试，实际执行并检查失败传播。
- [ ] 安装 Playwright Chromium/WebKit 测试引擎，执行 `npm run e2e`；引擎测试只说明网页层行为。macOS 原生 WKWebView、菜单和输入法按 Task 10 手工/系统 UI 自动化验证。Tauri WebDriver 在 macOS 的可用路径须按锁定工具版本实测，不能直接假设普通 tauri-driver 支持。
- [ ] 执行 `npm run tauri -w @wtypora/desktop -- build --debug --no-bundle`，确认新工程产物可启动。本阶段不要求发行签名和公证。
- [ ] 测量固定硬件上的空文档启动、1MiB 打开、10 万行编辑、输入延迟；冷启动 5 次，热启动 20 次，输入至少 1,000 个事件。报告硬件/系统/构建模式/样本哈希/median/p95/p99，不把 debug 数字用于承诺 release 性能；产品发布预算仍以 spec 为准。
- [ ] 运行 `git diff --check`、corpus 哈希复核，记录所有命令的时间、退出码和证据路径。没有 CI 远端执行证据时写“未执行”，不可写三平台已通过。
- [ ] 提交 `test: gate foundation builds and record validation`，输出本阶段交付说明：已完成能力、实际测试结果、混合换行只读限制、恢复快照损失窗口和后续阶段边界。

## E. 自查与覆盖矩阵

| 阶段 0–1 要求 | 任务 | 验证证据 |
| --- | --- | --- |
| 全新工程、CI、低干扰窗口 | 1、10、11 | 真窗口 + 三平台构建 |
| 单缓冲区、源码模式、语法扩展接点 | 3 | EditorView 身份、撤销与 EOL 测试 |
| UTF-8/BOM/LF/CRLF 与未知语法保真 | 2、3、6 | corpus 字节哈希、mtime 不变 |
| 新建/打开/保存/另存为 | 5、6、10 | IPC 契约 + 原生操作 |
| 授权与跨窗口会话隔离 | 5、10 | 越界路径与窗口归属测试 |
| 自动保存与在途编辑竞态 | 4、7 | fake timer + 版本序列测试 |
| 原子替换与故障 | 6 | 真实文件 + 故障注入 |
| 外部变更/删除/冲突 | 8 | 文件监听 + 重载竞争测试 |
| 未命名草稿/关闭/崩溃恢复 | 9、10 | 子进程终止 + 重启恢复 |
| 依赖、日志、安全和可观测性基础 | 1、5、11 | 精确版本、最小能力、无正文日志 |
| 性能基线与发布指标分离 | 11 | 固定样本的原始测量 |

本轮明确未覆盖产品 spec 的 §3.2 富预览、§3.3 工作区、§3.4 图片、§3.5 完整主题与模式、§3.6 导出、§3.7 历史浏览、§8 插件和 §12.5 完整签名发布门禁，均对应 spec 阶段 2–7。其缺席不允许以空实现、假按钮或测试替身冒充完成。

## F. 参考资料与实现风险

- [CodeMirror 官方状态实现](https://github.com/codemirror/state/blob/main/src/state.ts)：默认换行会标准化；显式 lineSeparator 和 sliceDoc 是保真接口依据。
- [Tauri 测试说明](https://v2.tauri.app/develop/tests/) 与 [WebDriver](https://v2.tauri.app/develop/tests/webdriver/)：mock runtime 不运行真实 WebView，浏览器通过不等于桌面通过。
- [Tauri 前置依赖](https://v2.tauri.app/start/prerequisites/)：执行时按选定平台核对构建环境。

本路线支持增量文本编辑，但“采用 CodeMirror 就一定能达到 Typora 手感”尚未被验证。阶段 2 必须用中文输入法、跨块选区、列表退格、表格边界和可视组件高度变化做真实交互验收。Tauri 默认壳也不自动提供 NSDocument 的完整原生标签与系统版本能力，阶段 6 需要单独验证平台适配实现。

本计划自查范围是需求覆盖、接口一致、故障语义和步骤可执行性；计划中的应用测试尚待实现后运行。
