import {
  markdownImageAlt,
  markdownImageUrl,
  resolveImageDomUrl,
} from "./imageUrl";

describe("visual editor image URLs", () => {
  it("maps Markdown-relative images to the document directory for display", () => {
    const convert = vi.fn((path: string) => `asset://${path}`);

    expect(resolveImageDomUrl("note.assets/photo.png", "/notes/note.md", convert)).toBe(
      "asset:///notes/note.assets/photo.png",
    );
    expect(convert).toHaveBeenCalledWith("/notes/note.assets/photo.png");
  });

  it("leaves web and data URLs unchanged", () => {
    const convert = vi.fn((path: string) => `asset://${path}`);

    expect(resolveImageDomUrl("https://example.com/image.png", "/notes/note.md", convert)).toBe(
      "https://example.com/image.png",
    );
    expect(resolveImageDomUrl("data:image/png;base64,AA==", "/notes/note.md", convert)).toBe(
      "data:image/png;base64,AA==",
    );
    expect(convert).not.toHaveBeenCalled();
  });

  it("escapes image alt text and encodes each Markdown URL path segment", () => {
    expect(markdownImageAlt("My [Photo]\n2026.png")).toBe("My \\[Photo\\] 2026.png");
    expect(markdownImageUrl("note.assets/My [Photo] #1.png")).toBe(
      "note.assets/My%20%5BPhoto%5D%20%231.png",
    );
  });
});
