import css from "../styles/app.css?raw";

describe("visual editor layout", () => {
  it("keeps the first document line close to the top of the writing area", () => {
    expect(css).toMatch(/\.visual-editor \.milkdown \{[^}]*padding: 0 24px 140px;/s);
    expect(css).toMatch(/\.visual-editor \.ProseMirror \{[^}]*padding-top: 24px;/s);
  });
});
