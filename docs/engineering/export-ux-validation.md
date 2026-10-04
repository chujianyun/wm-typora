# 导出提示与默认目录验收

- 日期：2026-09-09
- 状态：已完成 macos-delivery-gate，安装版已验证并保持运行。

## 修改

PDF 和 Word 导出成功后，完成提示显示 3 秒自动消失。开始下一次导出、切换文档或销毁编辑器时清除旧计时器，避免旧提示的计时器影响新的导出状态；进行中的提示、取消和错误状态继续遵循原有流程。

导出请求携带当前 Markdown 路径，原生保存面板使用该路径的父目录作为默认目录，保留原有默认文件名。未命名草稿或源目录已不存在时沿用系统默认位置。用户仍可手动选择其他目录。

## 交付检查

| 检查项 | 状态与证据 |
| --- | --- |
| 完整检查 | 通过：`npm run check`，107 项前端测试、42 项 Rust 测试；3 项既有手工/子进程入口用例忽略，0 失败。格式、类型、lint、前端构建、Clippy 均通过。[日志](evidence/export-ux/check.log) |
| 导出 E2E | 通过：`npm run e2e -- export.spec.ts`，Chromium/WebKit 共 4 项，验证导出文件、正文完整性和两种格式的成功提示自动消失。[日志](evidence/export-ux/e2e.log) |
| 打包与校验 | 通过：`npm run tauri -w @wtypora/desktop -- build --debug --bundles app`。ARM64 调试包，使用项目配置的 Apple Development 签名；源包、暂存包及安装包均通过 `verify-macos-bundle.mjs`。沿用本机开发包交付方式，未作发行公证；保留既有 Vite 大分块提示。[日志](evidence/export-ux/bundle.log) |
| 安装 | 通过：完整替换 `/Applications/WTypora.app`，旧包保留在工作区 `target/export-ux-backup`。新包与安装版可执行文件 SHA-256 一致。[安装记录](evidence/export-ux/installation.json) |
| 启动 | 通过：实际运行主程序为 `/Applications/WTypora.app/Contents/MacOS/wtypora-desktop`，最终检查 PID 60042，已运行超过 1 分钟。完成验证后关闭测试文档并恢复原来打开的已保存文章 |
| 界面与 PDF | 通过：实际查看安装版系统保存窗口，默认目录为测试 Markdown 所在的「中文 导出目录」，文件名为「导出体验验证.pdf」。点击保存生成 28,060 字节 PDF；实际查看成功提示及其随后自动消失的界面 |
| 界面与 Word | 通过：保存窗口默认进入同一源目录。手动改到上一级目录并保存成功，生成 8,935 字节 Word；实际查看提示出现并消失。再次导出时默认目录回到 Markdown 所在目录，而非上次手动选择的目录；取消后恢复编辑，无残留导出提示 |
| 文件验证 | 通过：PDF 文件头有效；Word ZIP 完整且保留中文标题和文末验证标记；测试 Markdown 原文保持逐字节一致。[结果](evidence/export-ux/native-results.json) |
| 联动 | 通过：前端导出请求和 Rust 反序列化同步；测试覆盖 PDF/Word、中文带空格路径、未命名草稿、源目录不存在、连续导出和 3 秒边界。未涉及数据库迁移、安装脚本或外部服务配置 |
| Git | 未提交、未推送。工作区已有大量修改，本次保留原有内容；项目未要求此任务提交或外部推送 |
| 未完成事项 | 无 |

界面检查使用任务内的原生窗口截图与操作结果，已实际查看保存面板和提示出现、消失后的渲染状态。
