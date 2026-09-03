import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/nord.css";
import { replaceAll } from "@milkdown/utils";
import { useEffect, useRef } from "react";
import type { EditorAdapter, EditorProps } from "./EditorAdapter";
import { renderMermaid } from "./mermaid";

export function VisualEditor({
  value,
  onChange,
  adapterRef,
  focusMode = false,
  typewriterMode = false,
  onImageUpload,
}: EditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const initialValueRef = useRef(value);
  const latestValueRef = useRef(value);
  const markdownRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const applyingRef = useRef(false);

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!rootRef.current) return;
    const crepe = new Crepe({
      root: rootRef.current,
      defaultValue: initialValueRef.current,
      featureConfigs: {
        [Crepe.Feature.Placeholder]: {
          text: "开始写作，输入 / 插入内容…",
          mode: "doc",
        },
        [Crepe.Feature.CodeMirror]: {
          previewOnlyByDefault: true,
          renderPreview: (language, content, applyPreview) => {
            if (language.toLowerCase() !== "mermaid") return null;
            const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
            void renderMermaid(content, theme).then((result) => {
              const preview = document.createElement("div");
              preview.dataset.mermaidPreview = "true";
              preview.className = "mermaid-preview";
              if (result.ok) {
                preview.innerHTML = result.svg;
              } else {
                const error = document.createElement("strong");
                error.textContent = `Mermaid 语法错误：${result.error}`;
                const source = document.createElement("pre");
                source.textContent = result.source;
                preview.append(error, source);
              }
              applyPreview(preview.outerHTML);
            });
            return undefined;
          },
        },
        ...(onImageUpload
          ? {
              [Crepe.Feature.ImageBlock]: {
                onUpload: onImageUpload,
              },
            }
          : {}),
      },
    });
    crepe.on((listener) => {
      listener.markdownUpdated((_context, markdown, previous) => {
        if (!applyingRef.current && markdown !== previous) {
          markdownRef.current = markdown;
          onChangeRef.current(markdown);
        }
      });
    });

    let adapter: EditorAdapter | null = null;
    void crepe.create().then(() => {
      crepeRef.current = crepe;
      if (latestValueRef.current !== markdownRef.current) {
        applyingRef.current = true;
        markdownRef.current = latestValueRef.current;
        crepe.editor.action(replaceAll(latestValueRef.current));
        queueMicrotask(() => {
          applyingRef.current = false;
        });
      }
      adapter = {
        getMarkdown: () => markdownRef.current,
        setMarkdown: (next) => {
          if (next === markdownRef.current) return;
          applyingRef.current = true;
          markdownRef.current = next;
          crepe.editor.action(replaceAll(next));
          queueMicrotask(() => {
            applyingRef.current = false;
          });
        },
        focus: () => {
          const editable = rootRef.current?.querySelector<HTMLElement>("[contenteditable=true]");
          editable?.focus();
        },
        getCursor: () => ({ line: 1, column: 1 }),
      };
      if (adapterRef) adapterRef.current = adapter;
    });

    return () => {
      if (adapterRef && adapterRef.current === adapter) adapterRef.current = null;
      crepeRef.current = null;
      void crepe.destroy();
    };
  }, [adapterRef, onImageUpload]);

  useEffect(() => {
    const crepe = crepeRef.current;
    if (!crepe || markdownRef.current === value) return;
    applyingRef.current = true;
    markdownRef.current = value;
    crepe.editor.action(replaceAll(value));
    queueMicrotask(() => {
      applyingRef.current = false;
    });
  }, [value]);

  return (
    <div
      aria-label="Markdown visual editor"
      className="visual-editor milkdown-theme-nord"
      data-focus-mode={focusMode || undefined}
      data-typewriter-mode={typewriterMode || undefined}
      ref={rootRef}
    />
  );
}
