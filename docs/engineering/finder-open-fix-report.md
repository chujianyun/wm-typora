# Finder 打开 Markdown 导致冷启动崩溃

- 日期：2026-09-06
- 处理状态：已修复，已更新本机 `/Applications/WTypora.app`。
- Git 状态：未提交、未推送。工作区已有大量未提交功能改动；本次只修改 `lib.rs` 的文件启动入口，新增 `launch.rs` 及本报告和证据，没有提交其他任务的改动。

## 根因与复现

macOS 从文件启动应用时，`RunEvent::Opened` 可能早于 `RunEvent::Ready`。Tauri 2.11.5 在 Ready 分支中执行 setup；旧代码在 Opened 中直接调用 `windows::open_path`，其中的 `app.state::<AppState>()` 读取尚未注册的状态，触发 panic，并在 macOS 的 Objective-C 回调边界发生不可展开的崩溃。

本机当天三份 DiagnosticReports 记录的 `application_open_urls` / SIGABRT 与此一致。使用旧安装包的隔离副本、独立 bundle identifier，通过 LaunchServices 打开仓库样本 `fixtures/markdown/lf.md`，复现出：

```text
state() called before manage() for wtypora_desktop::AppState
panic in a function that cannot unwind
```

隔离 identifier 用于避免文件事件交给已经运行的同名应用，没有修改旧包的 Rust 可执行文件。LaunchServices 的 `open -a <app> <file>` 覆盖 Finder“打开方式”所用的系统文件打开入口；本次未把命令行触发说成手工右键菜单点击。

## 修复

- 新增 `LaunchFiles`，在 managed state 之外缓存启动早期的文件路径。
- 收到 Ready 后再一次性按原顺序交给现有打开流程；启动后新收到的文件立即处理。
- 使用 `Url::to_file_path()` 保留中文、空格和特殊字符路径的正确解码，忽略非文件 URL。
- 沿用已有文件校验、空白窗口复用及重复文件聚焦逻辑；没有改动编辑器或文档保存机制。

## 原生运行证据

旧安装版在初始化失败后显示系统恢复提示（原生对话框尺寸，独立于编辑器窗口）：

![旧版启动崩溃提示](evidence/finder-open/before-crash-alert.png)

修复后的同一测试文件冷启动成功，显示标题、中文、Emoji 和已保存状态（1000 × 760 原生窗口，沿用当前 Night 主题）：

![修复版冷启动正常读取文件](evidence/finder-open/after-cold-open.png)

截图分别是旧包系统错误对话框和新包编辑器运行证据，不作为同尺寸布局对比。成功截图取自修复包的隔离 identifier 副本。重复向该运行实例打开同一个文件后，仍聚焦 `lf.md`，正文与状态正常。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| `cargo test -p wtypora-desktop launch::tests --locked` | 2 项通过：冷启动多文件排队及真实读取、中文/空格/# 路径、Ready 不重复派发、热启动直接打开、非文件 URL 忽略 |
| `npm run check` | 通过：44 项前端测试、34 项 Rust 测试；1 项忽略的是由父测试调用的崩溃子进程入口；格式、类型、lint、构建、Clippy 通过 |
| `npm run tauri -w @wtypora/desktop -- build --debug --bundles app` | 通过 |
| 隔离包原生冷启动与重复打开 | 正文可见，已保存，无错误日志 |
| 安装版冷启动 | 通过 LaunchServices 启动，进程持续运行超过两分钟，stderr 为空；安装文件与已验证构建产物逐字节一致 |

首次完整检查发现新测试文件有一处 rustfmt 换行差异，格式化后重跑完整检查通过。构建存在既有前端 chunk 超过 500 kB 的非阻断提示。

完整检查与构建日志、崩溃摘录和文件摘要保存在 [evidence/finder-open](evidence/finder-open)。

## 本机安装与边界

- 已按 README 的 macOS debug app 流程构建并更新安装；保留数据 identifier `com.wuming.wtypora.foundation`。
- 原安装包备份：`/Users/wuming/Library/Caches/wtypora-finder-fix-backup/WTypora-before.app`。
- 已安装可执行文件 SHA-256：`b43ea83ac595230decde953162479b4b7fc3fa028f75a6ff40afc83749677f9f`。
- 原生 UI 工具对正式 identifier 存在旧安装路径缓存，会误选构建目录的空白窗口，随后无法解析该 identifier。因此安装后的核验使用进程、stderr 与产物摘要；可见正文核验使用同一构建的隔离副本，不宣称已取得正式安装窗口的截图。
- 本次为本地调试构建更新，没有创建正式签名、公证发布或远端部署。未运行浏览器 E2E，因为改动只涉及 macOS 原生启动事件，已执行直接相关的原生回归与项目完整检查。Windows/Linux 没有本次实机验收。
