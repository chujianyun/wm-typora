import { afterEach, expect, it } from "vitest";
import { EditorView } from "@codemirror/view";
import { createBuffer, serialize } from "./buffer";
import { clipboardHTML } from "./clipboard";
let view: EditorView | undefined;
afterEach(() => {
  view?.destroy();
  document.body.innerHTML = "";
});
it.each(["source", "live"] as const)(
  "copies source and ordered rich images in %s mode without changing the document",
  (mode) => {
    const source =
      "图片之前\n![](https://example.com/a.gif)\n图片之后\n\n- **工具**";
    view = new EditorView({
      state: createBuffer(
        source,
        { encoding: "utf-8", eol: "lf" },
        false,
        [],
        mode,
      ),
      parent: document.body,
    });
    view.dispatch({ selection: { anchor: 0, head: source.length } });
    const data = new Map<string, string>();
    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        setData: (type: string, value: string) => data.set(type, value),
      },
    });
    view.contentDOM.dispatchEvent(event);
    expect(data.get("text/plain")).toBe(source);
    const target = document.createElement("div");
    target.innerHTML = data.get("text/html") ?? "";
    expect(target.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.com/a.gif",
    );
    expect(target.innerHTML).toMatch(/图片之前.*<img.*图片之后/s);
    expect(target.querySelectorAll("br")).toHaveLength(2);
    expect(target.querySelector("li strong")?.textContent).toBe("工具");
    expect(event.defaultPrevented).toBe(true);
    expect(serialize(view.state)).toBe(source);
  },
);
it("copies only selected text, preserving CRLF", () => {
  const source = "未选择\r\n正文\r\n结尾";
  view = new EditorView({
    state: createBuffer(source, { encoding: "utf-8", eol: "crlf" }),
    parent: document.body,
  });
  view.dispatch({ selection: { anchor: 4, head: view.state.doc.length } });
  const data = new Map<string, string>();
  const e = new Event("copy", { bubbles: true, cancelable: true });
  Object.defineProperty(e, "clipboardData", {
    value: { setData: (t: string, v: string) => data.set(t, v) },
  });
  view.contentDOM.dispatchEvent(e);
  expect(data.get("text/plain")).toBe("正文\r\n结尾");
  expect(data.get("text/html")).not.toContain("未选择");
});
it("keeps code literal and excludes raw HTML and unsafe images", () => {
  const html = clipboardHTML(
    "```md\n![](https://example.com/a.png)\n```\n\n<script>alert(1)</script>\n\n![](javascript:alert%281%29)\n\n![](file:///private/a.png)",
  );
  const root = document.createElement("div");
  root.innerHTML = html;
  expect(root.querySelector("code")?.textContent).toContain("![]");
  expect(root.querySelector("script,img,link")).toBeNull();
});
