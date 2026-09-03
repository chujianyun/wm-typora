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

export function TitleBar(props: TitleBarProps) {
  return (
    <header className="title-bar">
      <h1>WTypora</h1>
      <nav className="title-actions" aria-label="文档操作">
        <button aria-label="切换侧栏" onClick={props.onToggleSidebar}>☰</button>
        <button aria-label="新建文档" onClick={props.onNew}>＋</button>
        <button aria-label="打开文件" onClick={props.onOpen}>打开</button>
        <button aria-label="打开文件夹" onClick={props.onOpenWorkspace}>文件夹</button>
        <button aria-label="保存文档" onClick={props.onSave}>保存</button>
      </nav>
      <div className="document-title">
        <strong>{props.fileName}</strong>
        <span className={`save-state save-state-${props.saveStatus}`}>{saveLabels[props.saveStatus]}</span>
      </div>
      <nav className="view-actions" aria-label="视图操作">
        <button aria-label="查找与替换" onClick={props.onToggleFind}>查找</button>
        <button aria-label="导出 HTML" onClick={props.onExportHtml}>HTML</button>
        <button aria-label="打印或导出 PDF" onClick={props.onPrint}>打印</button>
        <button aria-label="源码模式" aria-pressed={props.mode === "source"} onClick={props.onToggleMode}>
          {props.mode === "source" ? "所见模式" : "源码"}
        </button>
        <button aria-label="切换主题" onClick={props.onCycleTheme}>
          {props.theme === "dark" ? "深色" : props.theme === "light" ? "浅色" : "系统"}
        </button>
      </nav>
    </header>
  );
}
