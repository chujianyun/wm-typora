# Finder 设置 WTypora 打开方式报错 2

- 日期：2026-09-06
- 处理状态：已恢复用户所指文件的 WTypora 关联；已修复应用包缺少完整签名的问题。
- 环境：macOS 26.6.2（25G83），本机 `/Applications/WTypora.app`。
- 发布状态：本机安装包已补全 ad-hoc 签名；构建配置已修正并验证。未提交、未推送，未进行远端发布。

## 现象与证据

在 Finder 文件简介中，从已有菜单选择 WTypora，实际复现错误代码 2。原文件未锁定，用户拥有文件及父目录写权限。修复前后正文 SHA-256 一致。

原安装包和构建包均未通过 `codesign --verify --deep --strict`，返回：

```text
code has no resources but signature indicates they must be present
```

可执行文件只有链接器产生的 ad-hoc 签名，签名 identifier 为编译产物名称，Info.plist 未绑定，Sealed Resources 为 none，应用包没有 `_CodeSignature` 资源封印。

这是一项已证实的打包缺陷，但不能把 Finder 错误 2 全部归因于签名：补全签名并重新注册后，旧菜单入口仍复现报错。直接调用 NSWorkspace 文件关联接口可以成功写入关联，独立进程再次查询也返回安装路径。随后通过 Finder 的“打开方式 → 其他…”明确选择 `/Applications/WTypora.app`，设置成功。关闭并重新打开同一文件简介，已显示“WTypora（默认）”。旧菜单记录/缓存异常是当前判断，尚未证明 macOS 内部具体失效点。

使用的是 Apple 提供的[单文件默认应用接口](https://developer.apple.com/documentation/appkit/nsworkspace/setdefaultapplication(at:toopenfileat:completion:))，没有批量修改其他文件或调用“全部更改”。

## 处理

1. 备份原安装包到 `/Users/wuming/Library/Caches/wtypora-default-open-backup/WTypora-before.app`。
2. 为当前安装包补全本地签名，重新向 LaunchServices 注册该应用路径。
3. 恢复原文件的应用关联，并通过 Finder 显式选取应用及重新打开简介验证。
4. `tauri.conf.json` 增加 `bundle.macOS.signingIdentity: "-"`，以后构建时为整个应用包签名。
5. 新增 `scripts/verify-macos-bundle.mjs`，对构建包/安装包执行完整签名校验。README 加入构建后及安装后的核验步骤，以及旧菜单报错时的处理办法。

没有删除用户文件的扩展属性，没有更改正文或权限，没有重置全系统 LaunchServices 数据库。未强制终止正在运行的编辑器。

## 前后证据

前图来自用户上传的原始错误截图；本次在相同原文件上也复现了此错误。

![修复前：设置打开方式报错](evidence/default-open/before-error.png)

后图来自本机 Finder，关闭并重新打开同一原文件简介后，“打开方式”显示“WTypora（默认）”。保持系统深色外观，折叠正文预览以避免展示正文。

![修复后：关联已生效](evidence/default-open/after-associated.png)

前图为系统错误对话框，后图为文件简介，窗口尺寸不同，用于证明错误与结果，不用于布局对比。

## 自动验证

| 检查 | 结果 |
| --- | --- |
| 校验脚本检查修复前备份包 | 按预期失败，退出码 1 |
| 校验脚本检查新构建包 | 通过，完整包签名有效 |
| 校验脚本检查实际安装包 | 通过 |
| macOS debug app 构建 | 通过；日志确认分别签名可执行文件和完整 `.app` |
| `npm run check` | 通过：44 项前端测试、34 项 Rust 测试；格式、类型、lint、构建、Clippy 均通过 |
| 新增校验脚本的 Prettier 检查 | 通过 |
| 原文件内容校验 | SHA-256 与处理前一致 |
| 原生界面关联验证 | 通过，“其他…”选择成功，重开简介仍显示 WTypora |

1 项忽略的 Rust 测试为既有崩溃子进程入口，由父测试调用。构建保留既有前端大 chunk 提示；ad-hoc 签名没有发行公证凭据，因此跳过公证是预期行为。日志和安装可执行文件摘要见 [evidence/default-open](evidence/default-open)。

## 边界与交付

- 当前文件的关联已恢复，未声称旧菜单项在所有其他文件、所有系统版本上均已修复。
- 本次重点验收关联设置；未重新执行编辑器正文交互或 Windows/Linux 实机验收。
- 新构建包签名已验证；实际安装包采用原包补签，未用新构建包覆盖正在运行的编辑器。安装包摘要已另存记录。
- 工作区进入本次任务前已有大量未提交功能改动，main 也领先 origin/main 1 个提交。本次保留这些现场，仅新增上述签名配置、核验脚本、文档与证据；未将其他任务改动一起提交或推送。
