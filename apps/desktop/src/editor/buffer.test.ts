import { describe, it, expect } from "vitest";
import { createBuffer, serialize } from "./buffer";
describe("source buffer", () => {
  it("preserves CRLF and trailing whitespace", () => {
    const text = "# A\r\n\r\n**中文**  \r\n";
    expect(
      serialize(createBuffer(text, { encoding: "utf-8", eol: "crlf" })),
    ).toBe(text);
  });
  it("makes mixed line endings readonly", () => {
    const s = createBuffer(
      "A\r\nB\n",
      { encoding: "utf-8", eol: "mixed" },
      true,
    );
    expect(s.readOnly).toBe(true);
    expect(serialize(s)).toBe("A\r\nB\n");
  });
  it("leaves unknown syntax and BOM content untouched", () => {
    const text = "---\ncustom: true\n---\n<div>🦀é</div>\n```unknown\na\n```";
    expect(
      serialize(createBuffer(text, { encoding: "utf-8-bom", eol: "lf" })),
    ).toBe(text);
  });
});
