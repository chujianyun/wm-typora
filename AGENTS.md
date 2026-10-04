# 项目约定

- 每次新增或修改功能后，都必须运行 `macos-delivery-gate` skill，完成 macOS 软件交付检查后再交付。

## Agent skills

### Issue tracker

Issues are tracked as GitHub issues in `chujianyun/wm-typora` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles use their default strings: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
