import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { NativeBridge } from "../native/bridge";
import { DocumentController, type UIState } from "../document/controller";
import { Dialogs } from "../components/Dialogs";
import { Settings } from "../components/Settings";
import { RecentFiles } from "../components/RecentFiles";
import {
  loadPreferences,
  savePreferences,
  preferenceKey,
  type Preferences,
} from "../settings/preferences";
import "./app.css";
import "../settings/themes.css";

const labels = {
  clean: "已保存",
  dirty: "未保存",
  saving: "保存中…",
  conflict: "外部冲突",
  error: "保存失败",
};
export function App({
  bridge,
  preview = false,
}: {
  bridge: NativeBridge;
  preview?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    controller = useRef<DocumentController | null>(null);
  const [ui, setUi] = useState<UIState>({
    session: null,
    modal: null,
    warning: null,
    busy: false,
    line: 1,
    column: 1,
    chars: 0,
  });
  const [preferences, setPreferences] = useState(loadPreferences);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const updatePreferences = (next: Preferences) => {
    try {
      savePreferences(next);
      setPreferences(next);
    } catch {
      controller.current?.reportOpenError("设置保存失败，请检查本地存储权限。");
    }
  };
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
  }, [preferences.theme]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === preferenceKey) setPreferences(loadPreferences());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const [menu, setMenu] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<"source" | "live">("live");
  const switchMode = (next: "source" | "live") => {
    const c = controller.current;
    if (!c || !ui.session || ui.busy || mode === next) return;
    if (!c.setMode(next)) return;
    setMenu(false);
    setMode(next);
  };
  useEffect(() => {
    const c = new DocumentController(host.current!, bridge);
    controller.current = c;
    const off = c.subscribe(() => setUi(c.ui));
    let alive = true;
    const cleanups: (() => void)[] = [];
    void (async () => {
      if (isTauri()) {
        const offOpen = await listen<string>(
          "document-open-request",
          (event) => void c.openPath(event.payload),
        );
        if (!alive) {
          offOpen();
          return;
        }
        cleanups.push(offOpen);
      }
      if (alive) await c.initialize();
    })();
    if (isTauri()) {
      void listen<string>("document-open-error", (e) =>
        c.reportOpenError(e.payload),
      ).then((f) => {
        if (alive) cleanups.push(f);
        else f();
      });
      void listen<boolean>("document-drag-state", (e) =>
        setDragging(e.payload),
      ).then((f) => {
        if (alive) cleanups.push(f);
        else f();
      });
      void getCurrentWindow()
        .listen<string>("document-command", (e) => {
          if (e.payload === "app.settings") setSettingsOpen(true);
          else if (e.payload === "document.recent") setRecentOpen(true);
          else void c.command(e.payload);
        })
        .then((f) => {
          if (alive) cleanups.push(f);
          else f();
        });
      void getCurrentWindow()
        .onCloseRequested((e) => {
          e.preventDefault();
          void c.close();
        })
        .then((f) => {
          if (alive) cleanups.push(f);
          else f();
        });
    }
    const keys = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.isComposing) return;
      if (e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
        return;
      }
      if (isTauri()) return;
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        void c.save(e.shiftKey);
      }
      if (e.key.toLowerCase() === "w") {
        e.preventDefault();
        void c.close();
      }
    };
    window.addEventListener("keydown", keys);
    return () => {
      alive = false;
      off();
      cleanups.forEach((f) => f());
      window.removeEventListener("keydown", keys);
      c.dispose();
      controller.current = null;
    };
  }, [bridge]);
  const title = ui.session?.path?.split(/[\\/]/).at(-1) ?? "无标题";
  useEffect(() => {
    const t =
      title + (ui.session?.phase === "dirty" ? " •" : "") + " — WTypora";
    document.title = t;
    if (isTauri()) void getCurrentWindow().setTitle(t);
  }, [title, ui.session?.phase]);
  const run = (id: string) => {
    setMenu(false);
    if (id === "app.settings") setSettingsOpen(true);
    else if (id === "document.recent") setRecentOpen(true);
    else void controller.current?.command(id);
  };
  return (
    <div className="app">
      <div
        className="workspace"
        inert={ui.modal || settingsOpen || recentOpen ? true : undefined}
      >
        <header className="topbar">
          <span className="document-name" title={ui.session?.path ?? ""}>
            {title}
            <span className="modified">
              {ui.session?.phase === "dirty" ? " •" : ""}
            </span>
          </span>
          <div className="top-actions">
            <div className="mode-switch" role="group" aria-label="文档模式">
              <button
                aria-pressed={mode === "live"}
                disabled={!ui.session || ui.busy}
                title="边写边渲染，点击段落即可编辑"
                onClick={() => switchMode("live")}
              >
                撰写
              </button>
              <button
                aria-pressed={mode === "source"}
                disabled={!ui.session || ui.busy}
                title="查看和编辑 Markdown 源码"
                onClick={() => switchMode("source")}
              >
                源码
              </button>
            </div>
            <button
              className="more"
              aria-label="文档操作"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                aria-hidden="true"
                focusable="false"
              >
                <circle cx="5" cy="10" r="1.4" fill="currentColor" />
                <circle cx="10" cy="10" r="1.4" fill="currentColor" />
                <circle cx="15" cy="10" r="1.4" fill="currentColor" />
              </svg>
            </button>
          </div>
          {menu && (
            <div className="document-menu" aria-label="文档操作菜单">
              {(
                [
                  ["document.new", "新建"],
                  ["document.open", "打开…"],
                  ["document.recent", "最近打开…"],
                  ["document.save", "保存"],
                  ["document.saveAs", "另存为…"],
                  ["document.exportDocx", "导出 Word（.docx）…"],
                  ["document.exportPdf", "导出 PDF…"],
                  ["edit.undo", "撤销"],
                  ["edit.redo", "重做"],
                  ["edit.codeBlock", "插入代码块"],
                  ["document.close", "关闭文档"],
                  ["app.settings", "设置…"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  aria-label={label}
                  disabled={
                    ui.busy ||
                    (id.startsWith("document.export") &&
                      (!ui.session || !!ui.uploading)) ||
                    (id === "edit.codeBlock" &&
                      (!ui.session || ui.session.readOnly))
                  }
                  onClick={() => run(id)}
                >
                  {label}
                  <kbd>
                    {id === "document.save"
                      ? "⌘S"
                      : id === "document.open"
                        ? "⌘O"
                        : id === "edit.codeBlock"
                          ? /Mac/.test(navigator.platform)
                            ? "⌘⌥C"
                            : "Ctrl+Alt+C"
                          : ""}
                  </kbd>
                </button>
              ))}
            </div>
          )}
        </header>
        {preview && (
          <div className="preview-banner">
            浏览器交互预览 · 文件仅保存在内存，桌面版使用本地文件
          </div>
        )}
        {ui.session?.readOnly && (
          <div className="notice">
            此文件的换行格式暂仅支持只读，原文件不会被改写。
          </div>
        )}
        {(ui.warning || ui.session?.error) && (
          <div className="notice error" role="alert">
            <span>{ui.warning ?? ui.session?.error?.message}</span>
            {ui.session?.phase === "conflict" && (
              <button onClick={() => void controller.current?.showConflict()}>
                比较与处理
              </button>
            )}
          </div>
        )}
        {ui.exportStatus && (
          <div className="notice export-notice" role="status">
            {ui.exportStatus}
          </div>
        )}
        {ui.uploading && (
          <div className="notice upload-notice" role="status">
            图片上传中…可以继续写作，完成后自动插入链接。
          </div>
        )}
        <main
          className={`writing-area ${mode === "live" ? "live-writing" : "source-writing"}`}
          ref={host}
        />
        {!preview && ui.session && !ui.session.path && ui.chars === 0 && (
          <div className="open-hint">
            拖入 Markdown 文件，或{" "}
            <button disabled={ui.busy} onClick={() => run("document.open")}>
              ⌘O 打开文件
            </button>
          </div>
        )}
        {dragging && (
          <div className="drop-overlay" role="status">
            松开以打开 Markdown 文件<span>当前文档将保留</span>
          </div>
        )}
        {!ui.session && !ui.warning && <p className="loading">正在打开文档…</p>}
        <footer className="statusbar">
          <span className="save-status" aria-live="polite">
            {ui.session
              ? ui.session.readOnly
                ? "只读"
                : ui.session.path
                  ? labels[ui.session.phase]
                  : ui.session.phase === "clean"
                    ? "未命名文档"
                    : "草稿未保存"
              : ""}
          </span>
          <div>
            <span>{ui.chars.toLocaleString()} 字符</span>
            <span>
              Ln {ui.line}, Col {ui.column}
            </span>
            <span>{ui.session?.format.eol.toUpperCase() ?? "LF"}</span>
            <span>{ui.session?.format.encoding.toUpperCase() ?? "UTF-8"}</span>
          </div>
        </footer>
      </div>
      {settingsOpen && (
        <Settings
          value={preferences}
          onChange={updatePreferences}
          onClose={() => {
            setSettingsOpen(false);
            controller.current?.view.focus();
          }}
        />
      )}
      {recentOpen && (
        <RecentFiles
          bridge={bridge}
          onClose={() => {
            setRecentOpen(false);
            controller.current?.view.focus();
          }}
          onOpen={(path) => {
            setRecentOpen(false);
            void controller.current?.openPath(path);
          }}
        />
      )}
      {controller.current && ui.modal && (
        <Dialogs ui={ui} controller={controller.current} />
      )}
    </div>
  );
}
