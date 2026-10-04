import { EditorView } from "@codemirror/view";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Preserve the visible line breaks of the writing surface in rich-text editors.
type Node = { type: string; value?: string; children?: Node[] };
function clipboardBreaks() {
  return (tree: Node) => {
    const walk = (node: Node) => {
      if (!node.children) return;
      node.children = node.children.flatMap((child) => {
        if (child.type === "text" && child.value?.includes("\n"))
          return child.value
            .split("\n")
            .flatMap((value, index) =>
              index
                ? [{ type: "break" }, { type: "text", value }]
                : [{ type: "text", value }],
            );
        walk(child);
        return [child];
      });
    };
    walk(tree);
  };
}

export function clipboardHTML(source: string) {
  return renderToStaticMarkup(
    <Markdown
      remarkPlugins={[remarkGfm, clipboardBreaks]}
      skipHtml
      components={{
        img: ({ src, alt, title }) => {
          try {
            const url = new URL(src ?? "");
            if (
              ["http:", "https:"].includes(url.protocol) &&
              !url.username &&
              !url.password
            )
              return <img src={url.href} alt={alt ?? ""} title={title} />;
          } catch {
            /* Local images are not supported by the editor yet. */
          }
          return <span>{`[图片：${alt || src || "不支持的链接"}]`}</span>;
        },
        input: ({ checked }) => <span>{checked ? "☑" : "☐"} </span>,
      }}
    >
      {source}
    </Markdown>,
  ).replace(/<link\b[^>]*rel="preload"[^>]*>/g, "");
}

export const richClipboard = EditorView.domEventHandlers({
  copy(event, view) {
    if (!event.clipboardData || view.state.selection.main.empty) return false;
    const source = view.state.selection.ranges
      .map(({ from, to }) => view.state.sliceDoc(from, to))
      .join(view.state.lineBreak);
    // Both formats belong to the same selection. CodeMirror pastes text/plain;
    // document editors can choose text/html without parsing Markdown themselves.
    const html = clipboardHTML(source);
    event.clipboardData.setData("text/plain", source);
    event.clipboardData.setData("text/html", html);
    event.preventDefault();
    return true;
  },
});
