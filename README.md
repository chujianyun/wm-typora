# WTypora

面向长期本地写作的跨平台 Markdown 桌面编辑器，macOS 首发。本分支实现已批准计划的阶段 0–1 基础工作流，不是完整 Typora 替代品，也尚未完成 macOS 全量验收。

## 已实现

- 单个 CodeMirror 6 正文缓冲区：源码编辑、语法高亮、撤销/重做、查找/替换、自动折行。
- 默认「撰写」模式：同一编辑区内边写边渲染，支持标题、强调、列表、引用、代码块、GFM 表格和任务列表。光标所在块显示可编辑 Markdown，点击其他已排版的块即可编辑，离开后恢复排版。
- 代码块：文档操作菜单选择「插入代码块」，或按 `Cmd+Option+C`（Windows/Linux 为 `Ctrl+Alt+C`），可将选中文字包成代码块；输入三个反引号及可选语言名后回车，自动补齐结束标记。支持 JavaScript/TypeScript（含 JSX/TSX）、Python、JSON、HTML、CSS 高亮，其他语言按纯文本显示。撰写时显示语言标签，点击后可直接修改语言名和代码，Tab/Shift+Tab 调整缩进。
- 右上角仅保留「撰写 / 源码」，源码模式显示完整 Markdown；两种模式共享正文、光标及撤销记录，保存原文，无独立预览模式。
- 撰写模式保留单次回车产生的可见换行，保存的 Markdown 原文不额外插入换行标记。
- 「设置…」（`Cmd+,` / `Ctrl+,`）：GitHub、Newsprint、Night、Sepia 及跟随系统主题，选择即时生效并持久保存。
- 图片粘贴可选择 PicGo 桌面版（本机 Server）或 PicGo-Core（可执行文件路径）。在图床软件中完成图床配置后，粘贴图片自动上传，可设置插入 `![文件名](链接)` 或 `![](链接)`；上传期间可继续写作，失败提示原因。默认不开启自动上传。PicGo-Core 子进程自动补充程序所在目录及 macOS Homebrew 路径。
- 撰写模式加载 HTTP(S) 与本地 Markdown 图片，按编辑区宽度缩放，加载失败时显示提示。相对路径按当前文档所在目录解析（支持 `./`、`../`、百分号转义、`file://` 与绝对路径，单张不超过 20 MB）；未保存文档中的相对图片无法解析时显示提示。点击图片所在块可编辑其 Markdown，离开后重新显示图片。原始 HTML 不执行，`javascript:`、`data:` 与带凭据的图片链接保持拦截。
- 系统标题栏、居中 760px 写作区域、默认无侧栏；轻量文件菜单与保存状态。
- 原生新建/打开/保存/另存为、多窗口、macOS 文件打开事件与菜单快捷键。
- 「文件」或右上角「文档操作」菜单支持「导出 Word（.docx）…」和「导出 PDF…」。导出当前完整编辑内容，包括未保存草稿；原 Markdown 路径、保存状态和撤销记录保持不变。Word 保留可编辑标题、强调、列表、表格、链接和代码；PDF 在 macOS 11+ 使用系统排版，按 A4 分页，中文文字可选中。两种格式均嵌入 HTTP(S) 图片，无需安装 Word/Pandoc；图片获取失败、暂不支持本地图片或超过大小限制时保留占位说明并提示数量。PDF 使用白底打印样式。
- 「文件 → 最近打开…」或右上角「文档操作 → 最近打开…」可选择最近使用的 10 个文件，显示文件名与完整路径。记录按最近使用排序、自动去重并在重启后保留；成功打开、重复打开和另存为均更新记录，打开失败不会加入历史。
- 启动后可拖入 Markdown 文件，或按 `Cmd+O`（Windows/Linux 为 `Ctrl+O`）选择文件；未命名空白窗口直接载入文件，有正文时另开窗口，重复打开聚焦已有窗口。Finder 打开文件也会优先复用空白窗口。
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
node scripts/verify-macos-bundle.mjs
open "target/debug/bundle/macos/WTypora.app"
```

应用显示名称为 WTypora，数据目录继续使用 `com.wuming.wtypora.foundation`，保留重建版已有草稿；不迁移更早旧版本的数据。macOS 应用包固定使用 `tauri.conf.json` 中的 Apple Development 证书签名，构建机器的钥匙串需包含对应证书及私钥。不要改回 ad-hoc 签名（`-`），也不要通过 `APPLE_SIGNING_IDENTITY` 环境变量覆盖成临时签名：临时签名的应用身份会随构建改变，可能使 macOS 反复要求文件夹授权。验证脚本会拒绝临时签名。当前为本机开发签名，未做发行签名/公证，首次试用请使用文档副本。

从临时签名切换后，正常退出所有 WTypora 窗口，再打开 `/Applications/WTypora.app`，首次访问文稿文件夹时可能仍需点一次“允许”。以后保持签名身份与应用标识不变，并统一使用安装版本；`npm run desktop` 的开发进程不等同于已签名应用包。安装后可执行 `node scripts/verify-macos-bundle.mjs /Applications/WTypora.app` 核验实际安装包。若 Finder 的旧“打开方式”菜单项报错，可从“其他…”重新选择 `/Applications/WTypora.app`。

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

当前即时渲染以 Markdown 块为编辑单位（段落、列表、表格、代码块等）；活动块展示源码，其他块显示排版，不等同于完整 Typora 富文本编辑体验。原始 HTML 与链接定义保留为字面源码，链接不直接跳转。超大文档即时渲染性能尚未验收。专注段落/打字机模式、大纲/文件侧栏、本地图片/数学/图表、自定义 CSS 主题导入和原生标签页属于后续阶段。

混合换行和独立 CR 只读；非 UTF-8/NUL/超过 32 MiB 拒绝打开。另存为暂不覆盖其他已有文件，请用新文件名。目录持久性无法确认时不会宣称安全保存。外部程序最终校验与替换之间仍存在通用文件系统无法完全消除的竞态。Windows/Linux 尚未实机验收。

恢复记录按 500ms 去抖、持续输入最长 2s 请求落盘；调度/磁盘延迟和尚未提交的输入法组字不在持久性保证内。备份尚无可视化恢复入口，草稿不是完整版本历史。
