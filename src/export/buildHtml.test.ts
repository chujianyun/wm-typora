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

  it("preserves math delimiters inside inline and fenced code", async () => {
    const html = await buildHtmlDocument(
      ["`$inline$`", "", "```txt", "$$block$$", "```"].join("\n"),
      { title: "Code", theme: "light" },
    );

    expect(html).toContain("<code>$inline$</code>");
    expect(html).toMatch(/<pre><code class="language-txt">\$\$block\$\$/);
    expect(html).not.toContain("data-wtypora-slot");
  });

  it("embeds native MathML for standalone fractions and roots", async () => {
    const html = await buildHtmlDocument("$$\\frac{1}{\\sqrt{x}}$$", {
      title: "Math",
      theme: "light",
    });

    expect(html).toContain("<math");
    expect(html).toContain("<mfrac>");
    expect(html).toContain("<msqrt>");
    expect(html).not.toContain("katex-html");
  });

  it("does not render a Mermaid example nested inside a longer code fence", async () => {
    const html = await buildHtmlDocument(
      ["````markdown", "```mermaid", "flowchart LR", "A-->B", "```", "````"].join("\n"),
      { title: "Code sample", theme: "light" },
    );

    expect(html).toContain("```mermaid");
    expect(html).not.toContain("<svg");
  });

  it("renders valid tilde and longer Mermaid fences", async () => {
    const html = await buildHtmlDocument(
      ["~~~mermaid", "flowchart LR", "A-->B", "~~~", "", "````mermaid", "flowchart LR", "B-->C", "````"].join("\n"),
      { title: "Diagrams", theme: "light" },
    );

    expect(html.match(/<svg/g)).toHaveLength(2);
  });

  it("exports footnote references, definitions and return links", async () => {
    const html = await buildHtmlDocument(
      ["Text with a note[^1].", "", "[^1]: Footnote body."].join("\n"),
      { title: "Footnotes", theme: "light" },
    );

    expect(html).toMatch(/id="footnote-ref-1"/);
    expect(html).toMatch(/href="#footnote-1"/);
    expect(html).toContain("Footnote body.");
    expect(html).toMatch(/href="#footnote-ref-1"/);
  });

  it("resolves relative exported images from the Markdown source directory", async () => {
    const html = await buildHtmlDocument("![Photo](note.assets/photo.png)", {
      title: "Images",
      theme: "light",
      sourcePath: "/Users/wu ming/notes/note.md",
    });

    expect(html).toContain('<base href="file:///Users/wu%20ming/notes/">');
    expect(html).toContain('src="note.assets/photo.png"');
  });

  it("rewrites local image URLs for WebView printing", async () => {
    const resolveImageUrl = vi.fn(async (url: string) => `asset://localhost/${url}`);
    const html = await buildHtmlDocument("![Photo](note.assets/photo.png)", {
      title: "Print",
      theme: "light",
      resolveImageUrl,
    });
    expect(resolveImageUrl).toHaveBeenCalledWith("note.assets/photo.png");
    expect(html).toContain('src="asset://localhost/note.assets/photo.png"');
    expect(html).not.toContain("<base");
  });
});
