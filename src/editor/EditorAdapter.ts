import type { RefObject } from "react";

export interface CursorPosition {
  line: number;
  column: number;
}

export interface EditorAdapter {
  getMarkdown(): string;
  setMarkdown(markdown: string): void;
  focus(): void;
  getCursor(): CursorPosition;
}

export interface EditorProps {
  value: string;
  onChange: (markdown: string) => void;
  adapterRef?: RefObject<EditorAdapter | null>;
  focusMode?: boolean;
  typewriterMode?: boolean;
}
