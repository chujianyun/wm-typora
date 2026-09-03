import type { RefObject } from "react";
import type { EditorAdapter } from "./EditorAdapter";
import { SourceEditor } from "./SourceEditor";
import { VisualEditor } from "./VisualEditor";

export type EditorMode = "visual" | "source";

interface EditorPaneProps {
  mode: EditorMode;
  markdown: string;
  onChange: (markdown: string) => void;
  adapterRef?: RefObject<EditorAdapter | null>;
  focusMode?: boolean;
  typewriterMode?: boolean;
}

export function EditorPane({ mode, markdown, onChange, adapterRef, ...writingModes }: EditorPaneProps) {
  const Editor = mode === "visual" ? VisualEditor : SourceEditor;
  return (
    <section className="editor-pane" aria-label="Document editor">
      <Editor
        key={mode}
        value={markdown}
        onChange={onChange}
        adapterRef={adapterRef}
        {...writingModes}
      />
    </section>
  );
}
