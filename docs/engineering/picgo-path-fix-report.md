# PicGo-Core 程序搜索路径修复

日期：2026-09-06。状态：代码修复、自动检查、签名打包、安装与原生模拟上传验证通过。

## 原因与改动

原安装进程的 PATH 只有 `/usr/bin:/bin:/usr/sbin:/sbin`。PicGo 启动文件使用 `#!/usr/bin/env node`，即使设置了 `/opt/homebrew/bin/picgo`，也无法找到同目录的 Node，退出码为 127，实际错误为 `env: node: No such file or directory`。原上传实现将所有非零退出误报为图床配置问题。

`apps/desktop/src-tauri/src/uploads.rs` 新增子进程命令构造函数：先加入用户指定的绝对程序路径的父目录，保留继承的 PATH，macOS 再补入 `/opt/homebrew/bin`、`/usr/local/bin`。通过 `Command.env` 只设置本次子进程，继续使用独立参数调用，无 shell 拼接，不修改全局环境或图床凭据。非零退出提示现在包含退出状态，并提示检查 Node 环境和 PicGo 日志，不回显可能包含凭据的第三方日志。

## 验证

- 回归测试先失败再通过：在独立测试子进程中设置访达式精简 PATH，以带空格和分号的目录安装模拟 PicGo 及同目录运行时，执行真实 `upload` 调用，验证图片内容、返回链接及临时文件清理。见 [修复前](evidence/picgo-path/before-test.log) / [修复后](evidence/picgo-path/after-test.log)。
- `npm run check` 通过：格式、类型、ESLint、前端 69 项测试、生产前端构建、Rust 38 项测试与 Clippy；3 项忽略包含既有测试子进程入口、新增子进程入口及手动本机 PicGo 检查。子进程入口由父测试实际执行；手动 PicGo 检查另外执行通过。见 [检查日志](evidence/picgo-path/check.log)。
- 本机真实 PicGo 3.0.2，在精简 PATH 下分别使用完整路径和裸命令 `picgo`，通过生产命令构造函数执行 `--version`，均成功。见 [启动结果](evidence/picgo-path/real-picgo-startup.json)。
- `npm run tauri -w @wtypora/desktop -- build --debug --bundles app` 成功，使用既有 Apple Development 签名；项目签名检查脚本对产物及安装包均通过。未做发行公证，保持本机开发包原有交付方式。
- 正常退出旧进程后，完整替换 `/Applications/WTypora.app`。旧包保存在废纸篓，安装二进制与本次产物 SHA-256 一致。见 [安装清单](evidence/picgo-path/installation.json) / [签名结果](evidence/picgo-path/installed-signature.log)。
- 安装版使用 `/usr/bin:/bin:/usr/sbin:/sbin` 启动。通过预览复制合成 PNG，在独立 Markdown 测试文档粘贴，调用以 `#!/usr/bin/env node` 启动的本地模拟上传器；模拟器还启动真实 PicGo 检查版本。成功插入并保存测试链接、清理临时图片。应用 PATH 保持精简，上传子进程 PATH 包含 Homebrew 目录。见 [原生验证](evidence/picgo-path/native-result.json)。

## 恢复与边界

测试后将程序路径恢复为 `/opt/homebrew/bin/picgo`，关闭测试文档与测试图片，重新打开用户原来的已保存文章。图床凭据未修改，未向 OSS 上传文件。真实远端鉴权及网络上传仍以用户下次粘贴实际图片的结果为准。

本次仅修改上传模块并新增报告和验证证据。工作区原来有大量未提交改动，上传模块本身也是此前未跟踪文件；保留这些内容，没有提交或推送夹带它们的变更。安装包基于当前工作区构建。
