# 测试后代码质量审计报告

## 1. 门禁结论

- 项目：WTypora
- 审计范围：顶部工具栏重构、更多操作菜单、macOS 窗口关闭权限及可达调用链、相关测试与构建配置
- 风险级别：standard
- 结论：PASS
- 总分：98.5 / 100
- 一句话判断：可以进入本地交付阶段；需求路径、回归测试、Rust 安全回归和真实 Tauri 桌面打包均通过，未发现阻断项。

## 2. 评分卡

| 维度 | 得分/满分 | 最低分 | 是否达标 | 核心证据 |
|---|---:|---:|---|---|
| A 需求忠实度与功能保护 | 15/15 | 13 | 是 | 工具栏、样式和 capability 与两条需求逐项映射 |
| B 逻辑正确性与边界异常 | 20/20 | 17 | 是 | 菜单状态/清理路径及 close/destroy 根因链路已审查 |
| C 安全、隐私与依赖 | 15/15 | 13 | 是 | 权限仅限 main 窗口；npm audit 0 漏洞；Rust 安全回归通过 |
| D 数据完整性与并发 | 15/15 | 13 | 是 | 未保存确认未被绕过；既有原子写和并发测试通过 |
| E 性能、资源与韧性 | 8.5/10 | 8 | 是 | 监听器确定性释放；无性能基线且保留主包体积警告 |
| F 架构与可维护性 | 10/10 | 8 | 是 | UI、业务回调与 Tauri 权限边界清晰，无新增依赖 |
| G 测试有效性与回归证据 | 10/10 | 9 | 是 | 针对性测试旧实现会失败；前端 72 项、Rust 16 项通过 |
| H 可运维性与交付就绪 | 5/5 | 4 | 是 | arm64 `.app`/`.dmg` 构建成功且签名校验通过 |

## 3. 一票否决与证据缺口

- 未关闭 critical/high：0 个。
- 关键路径待验证：0 个。
- 失败的必需命令：0 个。
- 未覆盖范围：第三方依赖源码和无关编辑器/渲染实现未逐行重审；它们不属于本次 diff，并已纳入全量回归。

## 4. 审计范围与方法

### 已覆盖

- `src/components/TitleBar.tsx`、`src/styles/app.css` 的工具栏布局、交互状态、可访问名称和监听器释放。
- `src/app/App.tsx` 中应用菜单 `close()` 与未保存确认后 `destroy()` 的可达调用链。
- `src-tauri/capabilities/default.json` 及生成 schema 中的主窗口权限边界。
- 组件测试、App 集成测试、capability 契约测试、前端/Rust 全量回归和 macOS 桌面打包。
- 1280×720 基线与当前版本视觉对照，以及“更多操作”菜单展开状态。

### 排除

- 第三方依赖源码：不属于当前变更，以依赖审计、编译和回归测试覆盖。
- 与本次变更无关的编辑器、文件系统和渲染内部实现：未逐行重审，但其全量前端/Rust 测试已执行。
- macOS 原生交通灯的自动化鼠标点击：当前 UI 自动化表面不支持；以 capability 契约、调用链审查和真实桌面产物构建补证，登记为非阻断限制 CQ-004。

### 验证命令

| 类别 | 命令 | 退出码 | 关键结果 |
|---|---|---:|---|
| 针对性测试 | `npm test -- --run src/components/TitleBar.test.tsx src/app/tauriCapabilities.test.ts` | 0 | 2 文件、4 项通过 |
| 前端测试 | `npm test -- --run` | 0 | 16 文件、72 项通过 |
| Rust 测试 | `cargo test --manifest-path src-tauri/Cargo.toml --locked` | 0 | 16 项通过 |
| 类型检查 | `npm run typecheck` | 0 | 无错误 |
| lint | `npm run lint` | 0 | 0 warning / error |
| 前端构建 | `npm run build` | 0 | 构建成功；保留 chunk-size warning |
| Rust 格式 | `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | 0 | 通过 |
| Rust lint | `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings` | 0 | 通过 |
| 依赖审计 | `npm audit --omit=dev --audit-level=high --offline` | 0 | 0 vulnerabilities |
| 桌面打包 | `npm run tauri -- build --debug` | 0 | 生成 arm64 `.app` 和 `.dmg` |
| 签名校验 | `codesign --verify --deep --strict src-tauri/target/debug/bundle/macos/WTypora.app` | 0 | 通过 |
| diff 检查 | `git diff --check` | 0 | 无空白错误 |

## 5. 发现清单

| ID | 严重度 | 维度 | 状态 | 位置 | 证据与影响 | 建议处理方向 |
|---|---|---|---|---|---|---|
| CQ-003 | low | E | open | `/Users/wuming/Documents/Coding/my/wtypora/vite.config.ts:4` | Vite 报告主 `index` chunk 2148.75 kB；可能增加首次加载时间，不影响本次正确性 | 后续单独建立性能基线，并按编辑器/图表依赖做按需加载与拆包 |
| CQ-004 | low | G | accepted | `/Users/wuming/Documents/Coding/my/wtypora/src-tauri/capabilities/default.json:8` | 无原生交通灯自动化点击证据；已有 capability 契约、调用链、真实打包和签名证据 | 发布前可人工执行 dirty/clean 两种关闭场景，或补充 macOS 原生 UI 自动化 |

未发现 high 或 critical 问题，无需单项展开。

## 6. 已验证事实、推断与未验证项

### 已验证事实

- 旧版 1280×720 截图中多个顶部中文按钮竖向换行；当前截图中工具栏为统一尺寸图标，文件名与保存状态仍居中。
- `src/app/App.tsx:157` 使用 `close()`，`src/app/App.tsx:228-233` 在 dirty 关闭确认后使用 `destroy()`。
- `src-tauri/capabilities/default.json:8-9` 已包含 `core:window:allow-close` 和 `core:window:allow-destroy`。
- capability 契约测试、全量前端/Rust 测试、类型检查、lint、Clippy、生产构建和 Tauri debug 打包均以退出码 0 完成。
- 产物为 arm64 Mach-O；`.app` 约 37 MB，`.dmg` 约 13 MB；严格 codesign 校验通过。

### 推断

- 高置信度：原生关闭失效的根因是 Tauri ACL 未授权，因为调用链明确使用两个受控窗口 API，而补齐对应能力后契约测试及真实 Tauri 构建均通过。
- 中等置信度：现有大主包可能影响冷启动/首屏加载；当前没有同环境性能基线，不能量化实际影响。

### 未验证项

- 未用自动化鼠标实际点击 macOS 原生交通灯；缺少可控原生 app surface。该项不阻断本地交付，发布前人工点击 clean 和 dirty 两种场景即可补证。
- 未执行公证和正式发布签名；当前仅为本地 debug 产物，项目也没有提供发布凭据或部署目标。

## 7. 最短整改/补证顺序

1. 无一票否决项。
2. 正式发布前人工验证 clean 文档直接关闭、dirty 文档取消/放弃两条路径。
3. 建立首屏加载与 bundle 体积基线，再处理 CQ-003 的代码拆分。
4. 保留 CQ-004，直到接入 macOS 原生 UI 自动化或形成发布前人工检查单。

## 8. 复审入口

- 重新运行：`npm test -- --run`、`cargo test --manifest-path src-tauri/Cargo.toml --locked`、`npm run tauri -- build --debug`。
- 重查检查点：E2（性能基线）、G4（原生关闭的系统级证据）。
- 完整回归范围：顶部常用按钮、更多菜单 5 个动作、clean/dirty 关闭、应用菜单退出、前端与 Rust 全量测试。
- 关联 JSON 审计记录：`/Users/wuming/Documents/Coding/my/wtypora/_reports/code-quality-audit-20260904-02.json`。
