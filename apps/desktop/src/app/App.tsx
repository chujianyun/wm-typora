import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { NativeBridge } from "../native/bridge";
import { DocumentController, type UIState } from "../document/controller";
import { Dialogs } from "../components/Dialogs";
import "./app.css";

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
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const c = new DocumentController(host.current!, bridge);
    controller.current = c;
    const off = c.subscribe(() => setUi(c.ui));
    let alive = true;
    const cleanups: (() => void)[] = [];
    void c.initialize();
    if (isTauri()) {
      void listen<string>("document-command", (e) => {
        void c.command(e.payload);
      }).then((f) => {
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
      if (isTauri() || !(e.metaKey || e.ctrlKey) || e.isComposing) return;
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
    void controller.current?.command(id);
  };
  return (
    <div className="app">
      <div className="workspace" inert={ui.modal ? true : undefined}>
        <header className="topbar">
          <span className="document-name" title={ui.session?.path ?? ""}>
            {title}
            <span className="modified">
              {ui.session?.phase === "dirty" ? " •" : ""}
            </span>
          </span>
          <div className="top-actions">
            <span className="mode-label">源码</span>
            <button
              className="more"
              aria-label="文档操作"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              ···
            </button>
          </div>
          {menu && (
            <div className="document-menu" aria-label="文档操作菜单">
              {(
                [
                  ["document.new", "新建"],
                  ["document.open", "打开…"],
                  ["document.save", "保存"],
                  ["document.saveAs", "另存为…"],
                  ["edit.undo", "撤销"],
                  ["edit.redo", "重做"],
                  ["document.close", "关闭文档"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  aria-label={label}
                  disabled={ui.busy}
                  onClick={() => run(id)}
                >
                  {label}
                  <kbd>
                    {id === "document.save"
                      ? "⌘S"
                      : id === "document.open"
                        ? "⌘O"
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
        <main className="writing-area" ref={host} />
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
      {controller.current && ui.modal && (
        <Dialogs ui={ui} controller={controller.current} />
      )}
    </div>
  );
}
