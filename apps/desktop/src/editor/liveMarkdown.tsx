import { StateField, type EditorState } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";
import { parser, GFM } from "@lezer/markdown";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownContent } from "../components/MarkdownPreview";
import { resolveLocalImage } from "./localImages";

const markdownParser = parser.configure(GFM);

class MarkdownBlock extends WidgetType {
  constructor(readonly source: string) {
    super();
  }
  eq(other: MarkdownBlock) {
    return this.source === other.source;
  }
  toDOM(view: EditorView) {
    const element = document.createElement("div");
    element.className = "markdown-body live-markdown-block";
    element.innerHTML = renderToStaticMarkup(
      <MarkdownContent text={this.source} />,
    );
    // This is static React markup inside a CodeMirror widget, so bind resource
    // events here. Image decoding changes block height after the initial layout.
    for (const image of element.querySelectorAll<HTMLImageElement>(
      ".preview-image img",
    )) {
      const updateImage = () => {
        const failed = image.complete && image.naturalWidth === 0;
        image.hidden = failed;
        const message = image.parentElement!.querySelector<HTMLElement>(
          ".preview-image-error",
        )!;
        message.hidden = !failed;
        if (element.isConnected) view.requestMeasure();
      };
      image.addEventListener("load", updateImage);
      image.addEventListener("error", updateImage);
      const local = image.dataset.localSrc;
      if (local) {
        // Local bytes load asynchronously; a source-less image would otherwise
        // report complete-with-zero-width and flash the error hint immediately.
        void resolveLocalImage(local).then(
          (dataURL) => {
            image.src = dataURL;
          },
          () => image.dispatchEvent(new Event("error")),
        );
      } else if (image.complete) updateImage();
    }
    element.addEventListener("mousedown", (event) => {
      if (
        event.button !== 0 ||
        event.shiftKey ||
        event.metaKey ||
        event.ctrlKey
      )
        return;
      event.preventDefault();
      // Resolve the current position from the view, not an offset captured before edits.
      const anchor = view.posAtDOM(element);
      view.dispatch({ selection: { anchor } });
      view.focus();
    });
    element.addEventListener("click", (event) => event.preventDefault());
    element.addEventListener("auxclick", (event) => event.preventDefault());
    return element;
  }
  ignoreEvent() {
    return true;
  }
}

function parseBlocks(state: EditorState) {
  const source = state.doc.toString();
  const tree = markdownParser.parse(source);
  const blocks: { from: number; to: number; source: string; name: string }[] =
    [];
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    // A soft newline does not end a Markdown paragraph. Give standalone image
    // lines their own editing range so a caret in adjacent prose cannot hide them.
    // Use parsed images, not a regexp: code, escapes and nested markup stay intact.
    let from = node.from;
    if (node.name === "Paragraph") {
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.name !== "Image") continue;
        const line = state.doc.lineAt(child.from);
        if (
          child.to > line.to ||
          source.slice(line.from, child.from).trim() ||
          source.slice(child.to, line.to).trim()
        )
          continue;
        if (from < line.from) {
          blocks.push({
            from,
            to: line.from - 1,
            source: source.slice(from, line.from - 1),
            name: node.name,
          });
        }
        blocks.push({
          from: Math.max(from, line.from),
          to: line.to,
          source: source.slice(Math.max(from, line.from), line.to),
          name: node.name,
        });
        from = line.to + 1;
      }
    }
    if (from > node.to) continue;
    blocks.push({
      from,
      to: node.to,
      source: source.slice(from, node.to),
      name: node.name,
    });
  }
  return blocks;
}

function decorate(state: EditorState, blocks: ReturnType<typeof parseBlocks>) {
  const definitions = blocks
    .filter((block) => block.name === "LinkReference")
    .map((block) => block.source)
    .join("\n");
  const ranges = blocks.flatMap((block) => {
    const active = state.selection.ranges.some(
      (range) => range.from <= block.to && range.to >= block.from,
    );
    if (active && (block.name === "FencedCode" || block.name === "CodeBlock")) {
      const first = state.doc.lineAt(block.from).number;
      const last = state.doc.lineAt(block.to).number;
      return Array.from({ length: last - first + 1 }, (_, index) =>
        Decoration.line({
          attributes: {
            class:
              "cm-code-line" +
              (index === 0 ? " cm-code-start" : "") +
              (first + index === last ? " cm-code-end" : ""),
            spellcheck: "false",
          },
        }).range(state.doc.line(first + index).from),
      );
    }
    // Keep unsupported/raw HTML and reference definitions available as literal source.
    if (block.name === "HTMLBlock" || block.name === "LinkReference" || active)
      return [];
    return [
      Decoration.replace({
        widget: new MarkdownBlock(
          // Put references first so an unfinished fence cannot swallow them as code.
          (definitions ? `${definitions}\n\n` : "") + block.source,
        ),
        block: true,
      }).range(block.from, block.to),
    ];
  });
  return Decoration.set(ranges, true);
}

// Direct state decorations support replacements spanning multiple lines. The document
// remains Markdown; neither DOM edits nor rendered HTML are serialized back into it.
export const liveMarkdown = StateField.define<{
  blocks: ReturnType<typeof parseBlocks>;
  decorations: DecorationSet;
}>({
  create(state) {
    const blocks = parseBlocks(state);
    return { blocks, decorations: decorate(state, blocks) };
  },
  update(value, transaction) {
    if (!transaction.docChanged && !transaction.selection) return value;
    const blocks = transaction.docChanged
      ? parseBlocks(transaction.state)
      : value.blocks;
    return { blocks, decorations: decorate(transaction.state, blocks) };
  },
  provide: (field) =>
    EditorView.decorations.from(field, (value) => value.decorations),
});
