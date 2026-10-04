# Cmd+W 同时关闭多个窗口修复

- 日期：2026-09-06
- 状态：已修复，已更新 `/Applications/WTypora.app`；运行中的旧进程需退出重开。
- Git：未提交、未推送。工作区已有大量未提交功能改动，本次涉及的 App.tsx、lib.rs、windows.rs、Cargo.toml 与这些改动重叠，保留现场，未将其他任务的改动提交发布。

## 根因与修复

菜单已经选择了焦点窗口，但 Tauri 2.11.5 的 `Emitter::emit` 即便通过窗口句柄调用，仍然向所有目标广播。前端又使用全局 `listen`，导致每个窗口都执行 `document.close`。保存、撤销等共用菜单命令也有相同的串窗风险。

- 新增 `window_commands::send`，使用 `emit_to(window.label(), ...)` 明确发送目标。
- App 使用 `getCurrentWindow().listen` 接收文档命令。该步骤不可省略：Tauri 的全局 Any 监听器也会接收定向事件。
- 菜单命令调用上述发送入口；Cmd+Q 仍显式遍历所有窗口，每个窗口收到一次关闭请求。
- 保留现有保存、放弃、取消关闭流程。

涉及文件：`apps/desktop/src-tauri/src/window_commands.rs`、`windows.rs`、`lib.rs`、`apps/desktop/src/app/App.tsx`。新增 Rust 双窗口事件回归测试及 `App.native.test.tsx` 前端监听目标/卸载清理测试；Cargo.toml 仅为测试启用 Tauri test feature。

## 原生前后对照

macOS，1000 × 760 原生窗口，Night 主题，默认缩放。测试数据为未保存的 ` A` 与新建空白文档。操作是在前台空白窗口按 Cmd+W，观察后台草稿。

修复前，空白窗口关闭，后台草稿也错误弹出关闭确认：

![修复前](evidence/window-close/before.png)

修复后，只关闭空白窗口，后台草稿仍可编辑，没有关闭确认：

![修复后](evidence/window-close/after.png)

旧包使用本机安装版副本；新包使用本次构建副本。为绕开原生自动化工具的同名应用定位缓存，最终新包验证使用独立 bundle identifier 与显示名称 CloseValidation；没有修改 Rust 可执行文件中的业务代码。此前一次同名副本测试出现 noWindowsAvailable/timeout，未据此认定应用崩溃或验证成功，改用唯一标识后重做了双窗口验收。

## 验证

| 检查 | 结果 |
| --- | --- |
| 修复前 Rust 回归 | 失败：`background window received document.close`，证明旧广播行为可复现 |
| 修复后 Rust 回归 | 通过：关闭、保存、另存为、打开、撤销、重做、设置仅发送给指定窗口；退出遍历每个窗口只发送一次 |
| 前端 IPC 回归 | 两个窗口标签分别绑定自身 Window 目标，卸载注销监听；通过 |
| `npm run check` | 通过：45 项前端测试、35 项 Rust 测试；1 项忽略为既有崩溃子进程入口；格式、类型、lint、构建、Clippy 通过 |
| `npm run tauri -w @wtypora/desktop -- build --debug --bundles app` | 通过 |
| 原生双窗口 Cmd+W | 空白 B 关闭后 A 保持编辑；未保存 B 出现关闭确认，取消后 B 内容仍在；再次关闭并放弃 B 后 A 仍可编辑，无额外弹窗 |
| 原生 Cmd+Q | 双窗口退出请求关闭空白窗口，并对后台未保存草稿显示确认；确认后整个进程退出未作可靠实机验收，逐窗口命令分发由 Rust 回归覆盖 |
| 安装包校验 | `node scripts/verify-macos-bundle.mjs /Applications/WTypora.app` 通过；安装与构建可执行文件 SHA-256 一致 |

完整检查与回归日志见 [evidence/window-close](evidence/window-close)。浏览器 E2E 未执行：本次问题依赖原生菜单和多窗口事件路由，已使用原生 UI 与 Tauri 事件测试验证。Windows/Linux 未作实机验收。

## 本机更新

- 安装路径：`/Applications/WTypora.app`。
- 旧包备份：`/Users/wuming/Library/Caches/wtypora-window-close-backup/WTypora-before.app`。
- 安装可执行文件 SHA-256：`990b7c7f037267c70eebab19c18ecabf74477e124387ae33dbaf5a7064816320`。
- 本次沿用 README 的本机 debug app 构建流程，没有进行发行签名、公证或远端发布。安装的是当前工作区完整构建；没有强制结束用户运行中的应用。安装后的实际运行切换需退出重开。
