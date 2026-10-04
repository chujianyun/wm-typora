import { expect, it } from "vitest";
import { EditorSelection } from "@codemirror/state";
import { createBuffer, serialize } from "./buffer";
import { liveMarkdown } from "./liveMarkdown";

it("renders blocks without changing CRLF, whitespace or reference source", () => {
  const source =
    "\r\n# 标题\r\n\r\n[链接][ref]  \r\n\r\n[ref]: https://example.com\r\n";
  const state = createBuffer(
    source,
    { encoding: "utf-8-bom", eol: "crlf" },
    false,
    [],
    "live",
  );
  expect(state.field(liveMarkdown).decorations.size).toBe(2);
  expect(serialize(state)).toBe(source);
  const selected = state.update({
    selection: EditorSelection.range(0, state.doc.length),
  }).state;
  expect(selected.field(liveMarkdown).decorations.size).toBe(0);
  expect(serialize(selected)).toBe(source);
});

it("only exposes the selected block and re-renders edited text when the caret leaves", () => {
  const state = createBuffer(
    "# 原文\n\n末尾",
    { encoding: "utf-8", eol: "lf" },
    false,
    [],
    "live",
  );
  expect(state.field(liveMarkdown).decorations.size).toBe(1);
  const edited = state.update({
    changes: { from: 2, to: 4, insert: "修改" },
  }).state;
  const moved = edited.update({
    selection: { anchor: edited.doc.length },
  }).state;
  expect(moved.field(liveMarkdown).blocks[0].source).toBe("# 修改");
  const cursor = moved.field(liveMarkdown).decorations.iter();
  expect(cursor.from).toBe(0);
  expect(cursor.to).toBe(4);
  expect(serialize(moved)).toBe("# 修改\n\n末尾");
});

it.each([
  "前文\n![](https://example.com/a.png)\n后文",
  '前文\n  ![图片](https://example.com/a.png "标题")  \n后文',
  "前文\n![图片][ref]\n后文\n\n[ref]: https://example.com/a.png",
  "前文\n![](https://example.com/a.png)\n![](https://example.com/b.png)\n后文",
])(
  "previews standalone image lines independently of adjacent prose: %s",
  (source) => {
    const initial = createBuffer(
      source,
      { encoding: "utf-8", eol: "lf" },
      false,
      [],
      "live",
    );
    const state = initial.update({
      selection: { anchor: source.indexOf("后文") },
    }).state;
    const blocks = state.field(liveMarkdown).blocks;
    const images = blocks.filter((block) =>
      block.source.trim().startsWith("!["),
    );
    expect(images.length).toBe(source.includes("b.png") ? 2 : 1);
    for (const image of images) {
      let rendered = false;
      state
        .field(liveMarkdown)
        .decorations.between(image.from, image.to, (from, to) => {
          if (from === image.from && to === image.to) rendered = true;
        });
      expect(rendered).toBe(true);
    }
    expect(serialize(state)).toBe(source);
    const selected = state.update({
      selection: EditorSelection.range(0, state.doc.length),
    }).state;
    expect(selected.field(liveMarkdown).decorations.size).toBe(0);
  },
);

it.each([
  "前文 ![](https://example.com/a.png) 后文\n继续",
  "前文\n`![](https://example.com/a.png)`\n继续",
  "前文\n\\![](https://example.com/a.png)\n继续",
  "前文\n[![](https://example.com/a.png)](https://example.com)\n继续",
  "```md\n![](https://example.com/a.png)\n```",
  "> 前文\n> ![](https://example.com/a.png)\n> 后文",
  "- 前文\n  ![](https://example.com/a.png)\n  后文",
])("preserves inline and nested Markdown blocks: %s", (source) => {
  const state = createBuffer(
    source,
    { encoding: "utf-8", eol: "lf" },
    false,
    [],
    "live",
  );
  expect(state.field(liveMarkdown).blocks).toHaveLength(1);
  expect(serialize(state)).toBe(source);
});
