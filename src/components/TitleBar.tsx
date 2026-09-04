import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SaveStatus } from "../document/types";
import type { EditorMode } from "../editor/EditorPane";
import type { ThemePreference } from "../preferences/preferenceStore";

interface TitleBarProps {
  fileName: string;
  saveStatus: SaveStatus;
  mode: EditorMode;
  theme: ThemePreference;
  onNew(): void;
  onOpen(): void;
  onOpenWorkspace(): void;
  onSave(): void;
  onSaveAs(): void;
  onToggleSidebar(): void;
  onToggleMode(): void;
  onToggleFind(): void;
  onExportHtml(): void;
  onPrint(): void;
  onCycleTheme(): void;
}

const saveLabels: Record<SaveStatus, string> = {
  clean: "已保存",
  dirty: "未保存",
  saving: "保存中…",
  error: "保存失败",
};

function ToolbarIcon({ children }: { children: ReactNode }) {
  return (
    <svg className="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

export function TitleBar(props: TitleBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [moreOpen]);

  const runMenuAction = (action: () => void) => {
    setMoreOpen(false);
    action();
  };

  return (
    <header className="title-bar">
      <h1>WTypora</h1>
      <nav className="title-actions" aria-label="常用文档操作">
        <button className="toolbar-button" aria-label="切换侧栏" title="切换侧栏" onClick={props.onToggleSidebar}>
          <ToolbarIcon>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
          </ToolbarIcon>
        </button>
        <button className="toolbar-button" aria-label="新建文档" title="新建文档" onClick={props.onNew}>
          <ToolbarIcon>
            <path d="M12 5v14M5 12h14" />
          </ToolbarIcon>
        </button>
        <button className="toolbar-button" aria-label="打开文件" title="打开文件" onClick={props.onOpen}>
          <ToolbarIcon>
            <path d="M3.5 7.5h6l2 2h9v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
            <path d="M3.5 9.5V6a2 2 0 0 1 2-2h4l2 2h5" />
          </ToolbarIcon>
        </button>
      </nav>

      <div className="document-title">
        <strong>{props.fileName}</strong>
        <span className={`save-state save-state-${props.saveStatus}`}>{saveLabels[props.saveStatus]}</span>
      </div>

      <nav className="view-actions" aria-label="编辑器操作">
        <button className="toolbar-button" aria-label="查找与替换" title="查找与替换" onClick={props.onToggleFind}>
          <ToolbarIcon>
            <circle cx="10.5" cy="10.5" r="6" />
            <path d="m15 15 5 5" />
          </ToolbarIcon>
        </button>
        <button
          className="toolbar-button"
          aria-label="源码模式"
          title={props.mode === "source" ? "切换到所见模式" : "切换到源码模式"}
          aria-pressed={props.mode === "source"}
          onClick={props.onToggleMode}
        >
          <ToolbarIcon>
            <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
          </ToolbarIcon>
        </button>
        <button className="toolbar-button" aria-label="切换主题" title="切换主题" onClick={props.onCycleTheme}>
          <ToolbarIcon>
            {props.theme === "dark" ? (
              <path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z" />
            ) : props.theme === "light" ? (
              <>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </>
            ) : (
              <>
                <rect x="3" y="4" width="18" height="14" rx="2" />
                <path d="M8 22h8M12 18v4" />
              </>
            )}
          </ToolbarIcon>
        </button>

        <div className="title-more" ref={moreRef}>
          <button
            className="toolbar-button"
            aria-label="更多操作"
            title="更多操作"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
          >
            <ToolbarIcon>
              <circle cx="5" cy="12" r="1" className="icon-fill" />
              <circle cx="12" cy="12" r="1" className="icon-fill" />
              <circle cx="19" cy="12" r="1" className="icon-fill" />
            </ToolbarIcon>
          </button>
          {moreOpen ? (
            <div className="title-overflow-menu" role="menu" aria-label="更多操作">
              <button role="menuitem" aria-label="打开文件夹" onClick={() => runMenuAction(props.onOpenWorkspace)}>
                <span>打开文件夹…</span>
              </button>
              <div className="menu-separator" role="separator" />
              <button role="menuitem" aria-label="保存" onClick={() => runMenuAction(props.onSave)}>
                <span>保存</span><kbd>⌘S</kbd>
              </button>
              <button role="menuitem" aria-label="另存为" onClick={() => runMenuAction(props.onSaveAs)}>
                <span>另存为…</span><kbd>⇧⌘S</kbd>
              </button>
              <div className="menu-separator" role="separator" />
              <button role="menuitem" aria-label="导出 HTML" onClick={() => runMenuAction(props.onExportHtml)}>
                <span>导出 HTML…</span>
              </button>
              <button role="menuitem" aria-label="打印或导出 PDF" onClick={() => runMenuAction(props.onPrint)}>
                <span>打印 / PDF…</span><kbd>⌘P</kbd>
              </button>
            </div>
          ) : null}
        </div>
      </nav>
    </header>
  );
}
