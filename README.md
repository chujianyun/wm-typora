# WTypora · 重建基础版

面向长期本地写作的跨平台 Markdown 桌面编辑器，macOS 首发。本分支实现已批准计划的阶段 0–1 基础工作流，不是完整 Typora 替代品，也尚未完成 macOS 全量验收。

## 已实现

- 单个 CodeMirror 6 正文缓冲区：源码编辑、语法高亮、撤销/重做、查找/替换、自动折行。
- 系统标题栏、居中 760px 写作区域、默认无侧栏；轻量文件菜单与保存状态。
- 原生新建/打开/保存/另存为、多窗口、macOS 文件打开事件与菜单快捷键。
- 1 秒去抖自动保存、组字期间暂停；未命名文档使用独立恢复草稿。
- Rust 原子保存、UTF-8/BOM、LF/CRLF 保真、无修改不替换文件、每文件最近 20 份备份。
- 原生目录监听、外部更改重载/冲突比较、文件删除保护、窗口所属会话校验。
- 校验和草稿日志、恢复为未命名文档、关闭前保存/放弃/取消保护。

## 运行

需 Node 26.8.1、Rust 1.98.1 及 Tauri 平台前置依赖。

```sh
npm ci
npm run desktop
```

macOS 调试应用包：

```sh
npm run tauri -w @wtypora/desktop -- build --debug --bundles app
open "target/debug/bundle/macos/WTypora Foundation.app"
```

应用数据目录使用独立标识 `com.wuming.wtypora.foundation`，不会迁移旧版本数据。调试包未做发行签名/公证，首次试用请使用文档副本。

浏览器仅提供显式开发预览：`npm run dev` 后访问 `http://127.0.0.1:1420/?preview=1`。预览使用内存文件，不能代替真实文件验收；生产失败不会回退到虚假文件系统。

## 自测

```sh
npm run check
npx playwright install chromium webkit
npm run e2e
WTYPORA_PERF=1 npm run e2e -- --project=chromium
```

最后一条是 macOS/Linux shell 的可选浏览器性能采样，不属于发布性能认证。三平台 CI 已定义，远端未执行。详见 `docs/engineering/validation.md`。

## 当前边界

即时渲染、专注段落/打字机模式、大纲/文件侧栏、图片/数学/图表、主题、导出和原生标签页属于后续阶段。现阶段的界面刻意标记为“源码”，不能据此宣称视觉已一比一完成。

混合换行和独立 CR 只读；非 UTF-8/NUL/超过 32 MiB 拒绝打开。另存为暂不覆盖其他已有文件，请用新文件名。目录持久性无法确认时不会宣称安全保存。外部程序最终校验与替换之间仍存在通用文件系统无法完全消除的竞态。Windows/Linux 尚未实机验收。

恢复记录按 500ms 去抖、持续输入最长 2s 请求落盘；调度/磁盘延迟和尚未提交的输入法组字不在持久性保证内。备份尚无可视化恢复入口，草稿不是完整版本历史。
