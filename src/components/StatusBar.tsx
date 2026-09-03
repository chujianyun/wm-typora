import type { DocumentStatistics } from "../document/statistics";
import type { CursorPosition } from "../editor/EditorAdapter";
import type { EditorMode } from "../editor/EditorPane";

interface StatusBarProps {
  statistics: DocumentStatistics;
  cursor: CursorPosition;
  mode: EditorMode;
  focusMode: boolean;
  typewriterMode: boolean;
  onToggleFocus(): void;
  onToggleTypewriter(): void;
}

export function StatusBar({ statistics, cursor, mode, ...props }: StatusBarProps) {
  return (
    <footer className="status-bar">
      <span>{statistics.words} 词</span>
      <span>{statistics.characters} 字符</span>
      <span>{statistics.lines} 行</span>
      <span>{statistics.readingMinutes} 分钟阅读</span>
      <span>行 {cursor.line}，列 {cursor.column}</span>
      <span>{mode === "visual" ? "所见模式" : "源码模式"}</span>
      <span className="status-spacer" />
      <button aria-pressed={props.focusMode} onClick={props.onToggleFocus}>专注</button>
      <button aria-pressed={props.typewriterMode} onClick={props.onToggleTypewriter}>打字机</button>
    </footer>
  );
}
