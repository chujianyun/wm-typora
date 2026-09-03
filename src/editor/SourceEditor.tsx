import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap } from "@codemirror/view";
import { useEffect, useRef } from "react";
import type { EditorAdapter, EditorProps } from "./EditorAdapter";

export function SourceEditor({
  value,
  onChange,
  adapterRef,
  focusMode = false,
  typewriterMode = false,
}: EditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const applyingRef = useRef(false);
  const initialValueRef = useRef(value);
  const typewriterModeRef = useRef(typewriterMode);

  useEffect(() => {
    typewriterModeRef.current = typewriterMode;
  }, [typewriterMode]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!rootRef.current) return;
    const view = new EditorView({
      parent: rootRef.current,
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          EditorView.lineWrapping,
          highlightActiveLine(),
          EditorView.contentAttributes.of({
            "aria-label": "Markdown source editor",
            spellcheck: "true",
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !applyingRef.current) {
              onChangeRef.current(update.state.doc.toString());
            }
            if (typewriterModeRef.current && (update.docChanged || update.selectionSet)) {
              requestAnimationFrame(() => {
                viewRef.current?.dispatch({
                  effects: EditorView.scrollIntoView(update.state.selection.main.head, {
                    y: "center",
                  }),
                });
              });
            }
          }),
          EditorView.theme({
            "&": { height: "100%", backgroundColor: "transparent" },
            ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.7" },
            ".cm-content": { padding: "48px max(24px, calc((100% - 820px) / 2))" },
            ".cm-focused": { outline: "none" },
          }),
        ],
      }),
    });
    viewRef.current = view;

    const adapter: EditorAdapter = {
      getMarkdown: () => view.state.doc.toString(),
      setMarkdown: (next) => {
        if (next === view.state.doc.toString()) return;
        applyingRef.current = true;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
        applyingRef.current = false;
      },
      focus: () => view.focus(),
      getCursor: () => {
        const cursor = view.state.selection.main.head;
        const line = view.state.doc.lineAt(cursor);
        return { line: line.number, column: cursor - line.from + 1 };
      },
      navigateToLine: (requestedLine) => {
        const lineNumber = Math.max(1, Math.min(requestedLine, view.state.doc.lines));
        const line = view.state.doc.line(lineNumber);
        view.dispatch({
          selection: { anchor: line.from },
          effects: EditorView.scrollIntoView(line.from, { y: "center" }),
        });
        view.focus();
      },
      countMatches: (query) => query ? view.state.doc.toString().split(query).length - 1 : 0,
      revealMatch: (query, occurrence) => {
        if (!query) return;
        const contents = view.state.doc.toString();
        let from = -1;
        let cursor = 0;
        for (let index = 0; index <= occurrence; index += 1) {
          from = contents.indexOf(query, cursor);
          if (from < 0) return;
          cursor = from + query.length;
        }
        view.dispatch({
          selection: { anchor: from, head: from + query.length },
          effects: EditorView.scrollIntoView(from, { y: "center" }),
        });
      },
      replaceAllMatches: (query, replacement) => {
        if (!query) return;
        const contents = view.state.doc.toString();
        const changes: { from: number; to: number; insert: string }[] = [];
        let from = 0;
        while ((from = contents.indexOf(query, from)) >= 0) {
          changes.push({ from, to: from + query.length, insert: replacement });
          from += query.length;
        }
        if (changes.length) view.dispatch({ changes });
      },
    };
    if (adapterRef) adapterRef.current = adapter;

    return () => {
      if (adapterRef?.current === adapter) adapterRef.current = null;
      view.destroy();
      viewRef.current = null;
    };
  }, [adapterRef]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || value === view.state.doc.toString()) return;
    applyingRef.current = true;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    applyingRef.current = false;
  }, [value]);

  return (
    <div
      className="source-editor"
      data-focus-mode={focusMode || undefined}
      data-typewriter-mode={typewriterMode || undefined}
      ref={rootRef}
    />
  );
}
