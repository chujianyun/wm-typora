# 源码 / 预览切换验收

日期：2026-09-05。范围：只读 Markdown 预览、模式切换与紧凑菜单图标。

## 实现边界

- 源码与预览使用同一份 CodeMirror 文档；隐藏而不销毁源码编辑器，返回时恢复滚动位置与焦点。不通过渲染 HTML 回写文档。
- 使用 react-markdown 10.1.0 与 remark-gfm 4.0.1，精确版本及依赖完整锁定。参考：[react-markdown 官方说明](https://github.com/remarkjs/react-markdown)、[remark-gfm 官方说明](https://github.com/remarkjs/remark-gfm)。
- 常用 Markdown 与 GFM 表格、任务列表可预览；当前不是 Typora 式可编辑即时渲染。
- 原始 HTML 不执行；图片显示占位，不加载外部或本地资源；链接可复制但不直接跳转。未引入文件权限或 CSP 放宽。
- 三个点改为 20px SVG，固定点间距，28px 点击区域；源码与预览按钮在窄窗口仍可操作。

## 自动化证据

1. 新增 3 项组件回归先运行失败，原因是缺少预览按钮；新增 2 项 Chromium 用例先失败于缺少预览入口及点击区域偏小。实现后通过。
2. `CARGO_TARGET_DIR=/Users/wuming/Documents/Coding/my/wtypora-foundation/target npm run check`：退出 0，37 项前端测试、28 项 Rust 测试通过。格式、类型、lint、构建、Clippy 均通过。1 项 Rust 忽略入口由父级崩溃测试调用。
3. `npm run e2e`：Chromium / WebKit 共 10 项通过；2 项可选性能测试未启用。覆盖正文、光标、滚动位置、撤销、窄屏、深色与菜单操作。
4. 新增组件测试覆盖 Markdown / GFM 语义结构、禁用任务复选框、保留源码尾随空格、预览中保存源码、原始 HTML / 危险 URL 与资源加载限制。
5. npm 安装审计：0 个已报告漏洞。沿用的编辑器分包超过 500 kB 提示仍为非阻断构建警告。

## macOS 原生与安装证据

- Tauri debug app 构建退出 0，安装到 `/Applications/WTypora.app`。
- 安装版与构建目录可执行文件 SHA-256 均为 `3094fda44b1945405949a55f63c9ba5f16babfc8fb6d0d2a95c0db3c47a987ef`。
- 自动化工具对 `/Applications/WTypora.app` 留有旧标识缓存，无法直接绑定安装路径。因此原生交互在与安装版哈希相同的构建目录实例完成，不混记为直接操控安装路径的结果。
- 原生实测：输入验收正文 → 预览；看到真实标题、加粗、斜体、行内代码、引用、任务列表、表格和代码块；切回源码后仍为 216 字符、Ln 19 / Col 4，焦点回到编辑器；Cmd+Z 撤销原始输入，证明历史未重建。
- 验收后只放弃自动化创建的测试草稿并关闭测试实例。用户安装版保留运行；未删除用户文档或草稿。
- 替换前的应用包可从 `/Users/wuming/Library/Caches/wtypora-install.AUMYLd/WTypora.app` 恢复。

Windows / Linux、超大文档预览性能、图片 / 数学 / 图表渲染不在本次实机验收范围。
