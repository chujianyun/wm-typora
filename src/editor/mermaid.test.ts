import { MERMAID_CONFIG, renderMermaid } from "./mermaid";

describe("Mermaid rendering", () => {
  it("keeps the non-overridable security and resource limits", () => {
    expect(MERMAID_CONFIG).toMatchObject({
      securityLevel: "strict",
      startOnLoad: false,
      maxTextSize: 50_000,
      maxEdges: 500,
    });
  });

  it("renders a static SVG without scripts", async () => {
    const result = await renderMermaid("flowchart TD\nA-->B", "dark");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.svg).toContain("<svg");
      expect(result.svg).not.toContain("<script");
    }
  });

  it("reports syntax errors while preserving all source", async () => {
    const source = "this is not valid mermaid !!!";
    const result = await renderMermaid(source, "light");
    expect(result).toMatchObject({ ok: false, source });
  });
});
