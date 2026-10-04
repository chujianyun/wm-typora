# 原生 PDF 卡顿采样

2026-09-09，macOS 26.6.2，已安装应用第一次导出 PDF。

- 用户反馈彩色等待光标，窗口卡顿；CUA 无法正常读取窗口。
- `sample` 显示主线程停留在 `exports::print_pdf` → `NSPrintOperation::runOperation` → `NSConcretePrintOperation _renderView` → `NSView _printForCurrentOperation`，持续渲染页面。
- 约 2 分 31 秒时 CPU 为 98.8%，驻留内存约 2.46 GB；本次临时输出已达 1,187,020,800 字节，仍未完成。
- 已精确终止此次安装版进程，防止继续消耗资源。临时文件未原子替换目标 PDF，Markdown 未经过导出写入。
- WebKit 的 `WKPrintingView::knowsPageRange` 在主线程尚无页数时返回 `NSMakeRange(1, NSIntegerMax)`，只在后台打印路径等待实际页数；主线程同步 `runOperation()` 因而不断输出临时页面。
- 修复改用 `setCanSpawnSeparateThread(true)` 和 `runOperationModalForWindow:delegate:didRunSelector:contextInfo:`，完成回调返回后才校验、原子保存输出。

源码依据：[WebKit WKPrintingView.mm](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/mac/WKPrintingView.mm)，`knowsPageRange:` 和 `_isPrintingPreview`。

未保存用户正文或包含私人路径的原始采样日志到仓库。此修复调整原生打印调度，不改变界面布局；卡顿证据采用运行栈和资源采样，未伪造风车截图。
