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
  navigateToLine(line: number): void;
  countMatches(query: string): number;
  revealMatch(query: string, occurrence: number): void;
  replaceAllMatches(query: string, replacement: string): void;
}

export interface EditorProps {
  value: string;
  onChange: (markdown: string) => void;
  adapterRef?: RefObject<EditorAdapter | null>;
  focusMode?: boolean;
  typewriterMode?: boolean;
  onImageUpload?: (file: File) => Promise<string>;
  resolveImageUrl?: (url: string) => Promise<string> | string;
  documentPath?: string | null;
}
