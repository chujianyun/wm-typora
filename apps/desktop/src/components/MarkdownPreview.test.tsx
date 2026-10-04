import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { MarkdownContent } from "./MarkdownPreview";

it.each([
  "javascript:alert%281%29",
  "data:image/svg+xml;base64,PHN2Zy8+",
  "https://user:secret@example.com/image.png",
])("does not request unsupported or credential-bearing image URL %s", (url) => {
  const { container } = render(<MarkdownContent text={`![图片](${url})`} />);
  expect(container.querySelector("img, link[rel=preload]")).toBeNull();
  expect(container).toHaveTextContent("图片链接无效或暂不支持。");
});

it.each([
  "local.png",
  "./images/local.png",
  "../shared/local.png",
  "/absolute/local.png",
  "file:///tmp/local.png",
])("defers local image %s to document-scoped loading", (url) => {
  const { container } = render(<MarkdownContent text={`![图片](${url})`} />);
  const img = container.querySelector("img")!;
  expect(img).toHaveAttribute("data-local-src", url);
  expect(img).not.toHaveAttribute("src");
  expect(container).not.toHaveTextContent("图片链接无效或暂不支持。");
});

it("renders reference images with their description and without a referrer", () => {
  const { container } = render(
    <MarkdownContent
      text={
        '![参考图片][photo]\n\n[photo]: https://example.com/photo.png "图片标题"'
      }
    />,
  );
  const image = container.querySelector("img")!;
  expect(image).toHaveAttribute("src", "https://example.com/photo.png");
  expect(image).toHaveAttribute("alt", "参考图片");
  expect(image).toHaveAttribute("title", "图片标题");
  expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
  expect(container.querySelector("link[rel=preload]")).toBeNull();
});
