import { expect, it } from "vitest";
import JSZip from "jszip";
import { exportName, exportSnapshot, renderExport } from "./document";
import { createDocx } from "./word";
import { FakeBridge } from "../native/fakeBridge";

it.each(["pdf", "docx"] as const)(
  "passes the original Markdown path to the %s save panel",
  async (format) => {
    const bridge = new FakeBridge();
    const path = "/notes/中文 文件夹/周报.v2.MARKDOWN";
    await exportSnapshot(bridge, "# 导出正文", path, format);
    expect(bridge.exports[0]).toMatchObject({
      format,
      name: `周报.v2.${format}`,
      sourcePath: path,
    });
    await exportSnapshot(bridge, "# 新草稿", null, format);
    expect(bridge.exports[1]).toMatchObject({
      name: `无标题.${format}`,
      sourcePath: null,
    });
  },
);

it("names both formats without treating unrelated dots as extensions", () => {
  expect(exportName("/notes/周报.v2.MARKDOWN", "docx")).toBe("周报.v2.docx");
  expect(exportName(null, "pdf")).toBe("无标题.pdf");
});

it("renders all source content safely and replaces task controls with printable marks", () => {
  const root = renderExport(
    "# 中文\n\n- [x] 完成\n- [ ] 待办\n\n<script>alert(1)</script>\n\n[危险](javascript:alert%281%29)\n\n![图](https://example.com/a.png)\n\n" +
      "正文\n\n".repeat(200) +
      "最后一段",
  );
  expect(root.querySelector("script, input, [href^='javascript:']")).toBeNull();
  expect(root.querySelector("img")?.getAttribute("src")).toBeNull();
  expect(root.textContent).toContain("☑");
  expect(root.textContent).toContain("☐");
  expect(root.textContent).toContain("最后一段");
});

it("creates editable Word headings, styled runs, links, tables, nested numbering and code", async () => {
  const root = renderExport(
    "# 中文标题\n\n正文 **加粗** *斜体* ~~删除~~ [链接](https://example.com)\n第二行\n\n3. 第三项\n   - 嵌套条目\n4. 第四项\n\n| 列一 | 列二 |\n| --- | ---: |\n| 表格内容 | 42 |\n\n```js\nconst 中文 = 1;\n  console.log(中文);\n```\n\n结尾标记",
  );
  const zip = await JSZip.loadAsync(
    await createDocx(root, new Map(), "测试.docx"),
  );
  const xml = await zip.file("word/document.xml")!.async("string");
  const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
  const nums = await zip.file("word/numbering.xml")!.async("string");
  for (const value of [
    "中文标题",
    "Heading1",
    "<w:b/>",
    "<w:i/>",
    "<w:strike/>",
    "<w:hyperlink",
    "<w:tbl>",
    "表格内容",
    "嵌套条目",
    "<w:br/>",
    "  console.log",
    "结尾标记",
  ])
    expect(xml).toContain(value);
  expect(rels).toContain("https://example.com");
  expect(nums).toContain('<w:start w:val="3"/>');
});

it("embeds images in nested lists and creates a valid empty Word document", async () => {
  const root = renderExport(
    "- 一级\n  - ![示例](https://example.com/image.png)",
  );
  const img = root.querySelector("img")!;
  const data = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    ),
    (c) => c.charCodeAt(0),
  );
  const zip = await JSZip.loadAsync(
    await createDocx(
      root,
      new Map([[img, { data, width: 100, height: 100 }]]),
      "images.docx",
    ),
  );
  expect(
    Object.keys(zip.files).filter(
      (name) => name.startsWith("word/media/") && name.endsWith(".png"),
    ),
  ).toHaveLength(1);
  expect(await zip.file("word/document.xml")!.async("string")).toContain(
    "<w:drawing>",
  );
  const empty = await JSZip.loadAsync(
    await createDocx(renderExport(""), new Map(), "empty.docx"),
  );
  expect(await empty.file("word/document.xml")!.async("string")).toContain(
    "<w:p>",
  );
});
