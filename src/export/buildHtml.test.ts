import { buildHtmlDocument } from "./buildHtml";
import { sanitizeExportHtml } from "./sanitize";

describe("safe export", () => {
  it("removes executable tags, handlers and dangerous URLs", () => {
    const dirty = [
      '<p onclick="steal()">safe</p>',
      '<script>alert(1)</script>',
      '<iframe src="https://example.com"></iframe>',
      '<a href="javascript:alert(1)">bad link</a>',
    ].join("");

    const clean = sanitizeExportHtml(dirty);
    expect(clean).toContain("safe");
    expect(clean).not.toMatch(/script|onclick|iframe|javascript:/i);
  });

  it("creates standalone themed HTML with math and inline Mermaid SVG", async () => {
    const html = await buildHtmlDocument(
      [
        "# Exported",
        "",
        "Inline math: $x^2$",
        "",
        "```mermaid",
        "flowchart LR",
        "A-->B",
        "```",
      ].join("\n"),
      { title: "Exported", theme: "dark" },
    );

    expect(html).toContain("<!doctype html>");
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain("katex");
    expect(html).toContain("<svg");
    expect(html).not.toContain("<script");
  });
});
