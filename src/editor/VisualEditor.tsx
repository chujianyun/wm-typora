import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/nord.css";
import { editorViewCtx, serializerCtx } from "@milkdown/core";
import type { Node as ProseMirrorNode } from "@milkdown/prose/model";
import { TextSelection } from "@milkdown/prose/state";
import { replaceAll } from "@milkdown/utils";
import { useEffect, useRef, useState } from "react";
import { buildOutline, type OutlineItem } from "../workspace/outline";
import { splitFrontMatter } from "../document/frontMatter";
import type { EditorAdapter, EditorProps } from "./EditorAdapter";
import { renderMermaid } from "./mermaid";

function flattenOutline(items: OutlineItem[]): OutlineItem[] {
  return items.flatMap((item) => [item, ...flattenOutline(item.children)]);
}

interface TextSegment {
  from: number;
  offset: number;
  text: string;
}

function documentText(document: ProseMirrorNode) {
  const segments: TextSegment[] = [];
  let text = "";
  let priorEnd: number | null = null;
  document.descendants((node, position) => {
    if (!node.isText || !node.text) return;
    if (priorEnd !== null && position > priorEnd) text += "\n";
    segments.push({ from: position, offset: text.length, text: node.text });
    text += node.text;
    priorEnd = position + node.text.length;
  });
  return { segments, text };
}

function nthMatch(text: string, query: string, occurrence: number) {
  let from = 0;
  for (let index = 0; index <= occurrence; index += 1) {
    const match = text.indexOf(query, from);
    if (match < 0) return null;
    if (index === occurrence) return match;
    from = match + query.length;
  }
  return null;
}

function documentPosition(segments: TextSegment[], offset: number) {
  for (const segment of segments) {
    if (offset <= segment.offset + segment.text.length) {
      return segment.from + Math.max(0, offset - segment.offset);
    }
  }
  return segments.at(-1)?.from ?? 1;
}

export function VisualEditor({
  value,
  onChange,
  adapterRef,
  focusMode = false,
  typewriterMode = false,
  onImageUpload,
  resolveImageUrl,
  documentPath = null,
}: EditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const [initialDocument] = useState(() => splitFrontMatter(value));
  const initialValueRef = useRef(initialDocument.body);
  const latestValueRef = useRef(value);
  const markdownRef = useRef(value);
  const bodyRef = useRef(initialDocument.body);
  const frontMatterPrefixRef = useRef(initialDocument.prefix);
  const frontMatterRef = useRef(initialDocument.frontMatter);
  const frontMatterInputRef = useRef<HTMLTextAreaElement>(null);
  const [frontMatter, setFrontMatter] = useState(initialDocument.frontMatter);
  const [editorError, setEditorError] = useState<string | null>(null);
  const onChangeRef = useRef(onChange);
  const applyingRef = useRef(false);
  const userInteractionRef = useRef(false);

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const updateActiveBlock = () => {
      const editor = root.querySelector<HTMLElement>(".ProseMirror");
      const anchor = window.getSelection()?.anchorNode;
      if (!editor || !anchor || !editor.contains(anchor)) return;
      let active = anchor.nodeType === Node.ELEMENT_NODE
        ? (anchor as Element)
        : anchor.parentElement;
      while (active?.parentElement && active.parentElement !== editor) {
        active = active.parentElement;
      }
      editor.querySelectorAll<HTMLElement>("[data-active-block]").forEach((block) => {
        delete block.dataset.activeBlock;
      });
      if (!(active instanceof HTMLElement)) return;
      active.dataset.activeBlock = "true";
      if (typewriterMode) active.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    root.addEventListener("keyup", updateActiveBlock);
    root.addEventListener("mouseup", updateActiveBlock);
    root.addEventListener("input", updateActiveBlock);
    document.addEventListener("selectionchange", updateActiveBlock);
    return () => {
      root.removeEventListener("keyup", updateActiveBlock);
      root.removeEventListener("mouseup", updateActiveBlock);
      root.removeEventListener("input", updateActiveBlock);
      document.removeEventListener("selectionchange", updateActiveBlock);
    };
  }, [focusMode, typewriterMode]);

  useEffect(() => {
    if (!rootRef.current) return;
    const root = rootRef.current;
    let interactionTimer: number | null = null;
    const markUserInteraction = () => {
      userInteractionRef.current = true;
      if (interactionTimer !== null) window.clearTimeout(interactionTimer);
      interactionTimer = window.setTimeout(() => {
        userInteractionRef.current = false;
        interactionTimer = null;
      }, 100);
    };
    const interactionEvents = ["beforeinput", "keydown", "paste", "cut", "drop", "pointerdown", "click"];
    interactionEvents.forEach((event) => root.addEventListener(event, markUserInteraction, true));
    const crepe = new Crepe({
      root,
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
                proxyDomURL: resolveImageUrl,
              },
            }
          : {}),
      },
    });
    crepe.on((listener) => {
      listener.markdownUpdated((_context, markdown, previous) => {
        if (!applyingRef.current && userInteractionRef.current && markdown !== previous) {
          bodyRef.current = markdown;
          markdownRef.current = frontMatterPrefixRef.current + markdown;
          onChangeRef.current(markdownRef.current);
        }
      });
    });

    let adapter: EditorAdapter | null = null;
    let disposed = false;
    applyingRef.current = true;
    void crepe.create().then(() => {
      if (disposed) {
        void crepe.destroy();
        return;
      }
      crepeRef.current = crepe;
      const latest = splitFrontMatter(latestValueRef.current);
      frontMatterPrefixRef.current = latest.prefix;
      frontMatterRef.current = latest.frontMatter;
      bodyRef.current = latest.body;
      setFrontMatter(latest.frontMatter);
      markdownRef.current = latestValueRef.current;
      if (latest.body !== initialValueRef.current) {
        applyingRef.current = true;
        crepe.editor.action(replaceAll(latest.body));
      }
      // Crepe can publish a parser-normalized Markdown update from a later
      // macrotask while it finishes mounting its feature views. Keep the
      // document protected through that initialization turn so merely opening
      // a file never marks it dirty or rewrites its source formatting.
      window.setTimeout(() => {
        if (!disposed) applyingRef.current = false;
      }, 0);
      adapter = {
        getMarkdown: () => markdownRef.current,
        setMarkdown: (next) => {
          if (next === markdownRef.current) return;
          const parsed = splitFrontMatter(next);
          applyingRef.current = true;
          markdownRef.current = next;
          bodyRef.current = parsed.body;
          frontMatterPrefixRef.current = parsed.prefix;
          frontMatterRef.current = parsed.frontMatter;
          setFrontMatter(parsed.frontMatter);
          crepe.editor.action(replaceAll(parsed.body));
          queueMicrotask(() => {
            applyingRef.current = false;
          });
        },
        focus: () => {
          const editable = rootRef.current?.querySelector<HTMLElement>("[contenteditable=true]");
          editable?.focus();
        },
        getCursor: () => {
          const frontMatterInput = frontMatterInputRef.current;
          if (frontMatterInput && document.activeElement === frontMatterInput) {
            const beforeCursor = frontMatterInput.value.slice(0, frontMatterInput.selectionStart);
            const lines = beforeCursor.split(/\r?\n/);
            return {
              line: lines.length + 1,
              column: (lines.at(-1)?.length ?? 0) + 1,
            };
          }
          const view = crepe.editor.ctx.get(editorViewCtx);
          const serializer = crepe.editor.ctx.get(serializerCtx);
          const beforeCursor = serializer(
            view.state.doc.cut(0, view.state.selection.head),
          ).replace(/\n+$/, "");
          const lines = beforeCursor.split("\n");
          const frontMatterLines = frontMatterPrefixRef.current
            ? frontMatterPrefixRef.current.split(/\r?\n/).length - 1
            : 0;
          return {
            line: frontMatterLines + lines.length,
            column: (lines.at(-1)?.length ?? 0) + 1,
          };
        },
        navigateToLine: (line) => {
          const headings = rootRef.current?.querySelectorAll<HTMLElement>(
            ".ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6",
          );
          const index = flattenOutline(buildOutline(markdownRef.current)).findIndex(
            (item) => item.line === line,
          );
          const heading = index >= 0 ? headings?.item(index) : null;
          heading?.scrollIntoView({ block: "center", behavior: "smooth" });
          heading?.focus();
        },
        countMatches: (query) => {
          if (!query) return 0;
          const view = crepe.editor.ctx.get(editorViewCtx);
          const frontMatterMatches = frontMatterRef.current
            ? frontMatterRef.current.split(query).length - 1
            : 0;
          return frontMatterMatches + documentText(view.state.doc).text.split(query).length - 1;
        },
        revealMatch: (query, occurrence) => {
          if (!query) return;
          const frontMatter = frontMatterRef.current ?? "";
          const frontMatterMatches = frontMatter
            ? frontMatter.split(query).length - 1
            : 0;
          if (occurrence < frontMatterMatches) {
            const match = nthMatch(frontMatter, query, occurrence);
            if (match !== null) {
              frontMatterInputRef.current?.setSelectionRange(match, match + query.length);
              frontMatterInputRef.current?.scrollIntoView?.({ block: "nearest" });
            }
            return;
          }
          const view = crepe.editor.ctx.get(editorViewCtx);
          const { segments, text } = documentText(view.state.doc);
          const match = nthMatch(text, query, occurrence - frontMatterMatches);
          if (match === null) return;
          const from = documentPosition(segments, match);
          const to = documentPosition(segments, match + query.length);
          view.dispatch(
            view.state.tr
              .setSelection(TextSelection.create(view.state.doc, from, to))
              .scrollIntoView(),
          );
        },
        replaceAllMatches: (query, replacement) => {
          if (!query) return;
          const frontMatter = frontMatterRef.current;
          const nextFrontMatter = frontMatter?.split(query).join(replacement) ?? null;
          const frontMatterChanged = nextFrontMatter !== frontMatter;
          if (frontMatterChanged && nextFrontMatter !== null) {
            frontMatterRef.current = nextFrontMatter;
            frontMatterPrefixRef.current = `---\n${nextFrontMatter}\n---\n`;
            setFrontMatter(nextFrontMatter);
          }
          const view = crepe.editor.ctx.get(editorViewCtx);
          const { segments, text } = documentText(view.state.doc);
          const ranges: Array<{ from: number; to: number }> = [];
          let offset = 0;
          while ((offset = text.indexOf(query, offset)) >= 0) {
            ranges.push({
              from: documentPosition(segments, offset),
              to: documentPosition(segments, offset + query.length),
            });
            offset += query.length;
          }
          if (!ranges.length) {
            if (frontMatterChanged) {
              markdownRef.current = frontMatterPrefixRef.current + bodyRef.current;
              onChangeRef.current(markdownRef.current);
            }
            return;
          }
          let transaction = view.state.tr;
          for (const range of ranges.reverse()) {
            transaction = transaction.insertText(replacement, range.from, range.to);
          }
          view.dispatch(transaction);
          const nextBody = crepe.editor.ctx.get(serializerCtx)(view.state.doc);
          bodyRef.current = nextBody;
          markdownRef.current = frontMatterPrefixRef.current + nextBody;
          onChangeRef.current(markdownRef.current);
        },
      };
      if (adapterRef) adapterRef.current = adapter;
    }).catch((error: unknown) => {
      applyingRef.current = false;
      if (!disposed) {
        setEditorError(error instanceof Error ? error.message : String(error));
      }
    });

    return () => {
      disposed = true;
      if (interactionTimer !== null) window.clearTimeout(interactionTimer);
      userInteractionRef.current = false;
      interactionEvents.forEach((event) => root.removeEventListener(event, markUserInteraction, true));
      if (adapterRef && adapterRef.current === adapter) adapterRef.current = null;
      crepeRef.current = null;
      void crepe.destroy();
    };
  }, [adapterRef, documentPath, onImageUpload, resolveImageUrl]);

  useEffect(() => {
    const crepe = crepeRef.current;
    if (!crepe || markdownRef.current === value) return;
    const parsed = splitFrontMatter(value);
    applyingRef.current = true;
    markdownRef.current = value;
    bodyRef.current = parsed.body;
    frontMatterPrefixRef.current = parsed.prefix;
    frontMatterRef.current = parsed.frontMatter;
    setFrontMatter(parsed.frontMatter);
    crepe.editor.action(replaceAll(parsed.body));
    queueMicrotask(() => {
      applyingRef.current = false;
    });
  }, [value]);

  const updateFrontMatter = (next: string) => {
    const prefix = `---\n${next}\n---\n`;
    setFrontMatter(next);
    frontMatterRef.current = next;
    frontMatterPrefixRef.current = prefix;
    markdownRef.current = prefix + bodyRef.current;
    onChangeRef.current(markdownRef.current);
  };

  return (
    <div
      aria-label="Markdown visual editor"
      className="visual-editor milkdown-theme-nord"
      data-focus-mode={focusMode || undefined}
      data-typewriter-mode={typewriterMode || undefined}
    >
      {frontMatter !== null ? (
        <label className="frontmatter-panel">
          <span>YAML Front Matter</span>
          <textarea
            ref={frontMatterInputRef}
            aria-label="YAML Front Matter"
            spellCheck={false}
            value={frontMatter}
            onChange={(event) => updateFrontMatter(event.target.value)}
          />
        </label>
      ) : null}
      {editorError ? <div role="alert">可视化编辑器启动失败：{editorError}</div> : null}
      <div className="visual-editor-surface" ref={rootRef} />
    </div>
  );
}
