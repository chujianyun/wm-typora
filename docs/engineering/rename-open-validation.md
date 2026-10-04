# WTypora 更名与打开文件验证

日期：2026-09-05。范围：显示名称、原生拖入、打开文件入口；不代表完整 Typora 功能验收。

## 实现

- macOS 包名、显示名称为 WTypora，保留原数据标识与图标。
- 原生拖入按 Markdown / 纯文本扩展名校验，规范化路径，同批路径去重；有效文件独立打开，失败显示警告，不替换当前正文。
- 已打开或仍在初始化的同路径文件聚焦原窗口。
- 空白窗口提供拖入说明及打开按钮；菜单快捷键为 CmdOrCtrl+O。

## 验证证据

- `npm run check`：退出 0；34 项前端测试、28 项 Rust 测试通过；格式、类型、lint、构建、Clippy 通过。Rust 的 1 项忽略用例是由父测试调用的崩溃子进程入口。
- 拖入处理的两项 Rust 用例先对空实现运行，均失败；实现后通过。覆盖真实临时 Markdown 文件加载、中文与空格路径、大写扩展名、重复路径、已有会话保留、悬停不打开及非法类型提示。
- `npm run e2e`：Chromium / WebKit 共 6 项通过，2 项可选性能采样未启用。
- Tauri macOS debug app 构建成功；安装包 Info.plist 的 CFBundleName / CFBundleDisplayName 均为 WTypora，图标仍为 icon.icns。
- 安装版实际按 Cmd+O，原生对话框选取 `fixtures/markdown/lf.md`，编辑器显示文件名、中文、Emoji、已保存状态及 LF / UTF-8。关闭该样本后，原空白窗口仍在。
- 原生运行时源码确认 WindowContent 的拖入事件派发到 WindowEvent::DragDrop；路径处理单元测试通过。但本次自动化工具未完成 Finder 到应用窗口的真实跨窗口拖动，不将其记为人工实测通过。

安装位置：`/Applications/WTypora.app`。旧名称安装包保存在 `/Users/wuming/Library/Caches/wtypora-install.DYdJ2D/WTypora Foundation.app`，应用数据未删除。

## 已知边界

Windows / Linux 尚无本次实机验收。当前仍为未签名、公证的调试构建。前端编辑器分包的 500 kB 构建提示为既有非阻断警告。
