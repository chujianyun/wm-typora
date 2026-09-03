# WTypora

WTypora 是一个本地优先、单栏低干扰的桌面 Markdown 编辑器。默认使用 Milkdown/Crepe 提供所见即所得式写作体验，并可随时切换到 CodeMirror 6 源码模式；磁盘中始终只保存 Markdown。

## 开发环境

- Node.js 26 或更高版本（本项目验证环境为 Node.js 26.8.1）
- npm 11 或更高版本
- Rust stable 1.88 或更高版本
- macOS 构建需要 Xcode Command Line Tools

安装并启动桌面开发版：

```bash
npm install
npm run tauri dev
```

只启动浏览器开发版：

```bash
npm run dev
```

## 验证命令

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build -- --debug
```

## 当前功能

- 新建、打开、保存、另存为 Markdown 与文本文件
- 打开文件夹并浏览过滤后的 Markdown 文件树
- 800ms 自动保存、原子写入、错误状态与本地恢复草稿
- 外部文件变更监听，以及重新载入/保留当前版本冲突处理
- Milkdown/Crepe 所见模式与 CodeMirror 6 源码模式无损切换
- CommonMark、GFM、任务列表、表格、代码块、图片与 KaTeX 数学公式
- Mermaid 严格模式内联预览、错误保源与主题联动
- 大纲、字数/字符/行数/阅读时长、光标行列统计
- 查找与全部替换、专注模式、打字机模式、明暗/系统主题
- 拖放或粘贴图片到同目录 `<文档名>.assets` 文件夹
- 无脚本 HTML 导出与系统打印/PDF 流程
- 关闭或切换脏文档前的保存确认

## 常用快捷键

macOS 使用 Command；Windows/Linux 使用 Control。

| 操作 | 快捷键 |
| --- | --- |
| 新建 | `Cmd/Ctrl + N` |
| 打开 | `Cmd/Ctrl + O` |
| 保存 | `Cmd/Ctrl + S` |
| 另存为 | `Cmd/Ctrl + Shift + S` |
| 查找 | `Cmd/Ctrl + F` |
| 切换源码模式 | `Cmd/Ctrl + Shift + M` |
| 切换侧栏 | `Cmd/Ctrl + Shift + L` |
| 切换专注模式 | `Cmd/Ctrl + Shift + D` |
| 切换打字机模式 | `Cmd/Ctrl + Shift + T` |

## 安全边界

应用不上传文档或图片。Rust 文件命令只接受用户经原生对话框授予的文件/目录根路径；目录扫描忽略隐藏目录、依赖目录、构建目录和符号链接。Mermaid 固定使用 `securityLevel: "strict"`，HTML 导出会移除脚本、事件属性、iframe、嵌入对象和危险 URL。

## 项目结构

- `src/document`：文档状态机、自动保存、统计与恢复草稿
- `src/editor`：编辑器公共接口、Crepe、CodeMirror 与 Mermaid
- `src/native`：类型化 Tauri 桥接和浏览器测试替身
- `src/workspace`：文件树状态与大纲
- `src/export`：安全 HTML 与打印输出
- `src-tauri/src/commands`：受控文件、目录、图片和监听命令

Windows 与 Linux 保持源码和配置兼容，但首版打包验收以 macOS 为准。
