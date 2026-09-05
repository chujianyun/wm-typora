# 固定依赖与环境

2026-09-05 本机读取安装包 manifests、锁文件并构建验证。JS 直接依赖均使用精确版本，完整传递依赖以 package-lock.json / Cargo.lock 为准。Node 26.8.1；Rust 1.98.1；Apple M5 / 32 GiB；macOS 26.6.2 (25G83)。

| 组件 | 版本 | 用途 |
| --- | --- | --- |
| React / ReactDOM | 19.2.8 | 桌面 UI，不存储第二份正文 |
| CodeMirror state / view / commands | 6.7.4 / 6.43.11 / 6.11.0 | 唯一编辑缓冲区、事务、历史 |
| CodeMirror Markdown / search | 6.5.2 / 6.7.2 | Markdown 语法与查找 |
| Lezer Markdown | 1.7.2 | 增量语法分析 |
| Tauri API / CLI / Rust | 2.11.1 / 2.11.4 / 2.11.5 | 原生窗口和受控 IPC |
| rfd | 0.16.0 | 系统文件选择器 |
| notify | 8 (锁文件固定) | 原生父目录变化通知 |
| TypeScript / Vite | 6.0.3 / 8.2.2 | 类型检查与打包 |
| Vitest / Playwright | 5.0.0 / 1.63.0 | 状态、DOM、浏览器回归 |
| ESLint / Prettier | 10.10.0 / 3.9.6 | 静态检查与格式 |

本机读取的 engines：Vite `^20.19.0 || >=22.12.0`，Vitest `^22.12.0 || ^24.0.0 || >=26.0.0`，TypeScript `>=14.17`；Node 26.8.1 满足。CodeMirror/Lezer 未声明 Node engines。生产样式与图标由本项目新写，不使用旧实现或 Typora 品牌资产。

Linux CI 前置包按 [Tauri 官方说明](https://v2.tauri.app/start/prerequisites/) 配置。macOS 普通 tauri-driver 不提供 WKWebView 桌面自动化支持，因此浏览器引擎测试与原生系统 UI 验收分开记录，依据 [Tauri WebDriver 说明](https://v2.tauri.app/develop/tests/webdriver/)。

许可证 manifests：React、CodeMirror、Lezer、Vite、Vitest、Prettier 为 MIT，TypeScript 为 Apache-2.0，Tauri 为 Apache-2.0 OR MIT。此记录不是完整发行 SBOM/许可证清单；发行前仍需生成完整第三方归属。
