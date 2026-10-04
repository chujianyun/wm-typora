import { afterEach, expect, it } from "vitest";
import { EditorView } from "@codemirror/view";
import { render, screen } from "@testing-library/react";
import { createBuffer, serialize } from "./buffer";
import { MarkdownContent } from "../components/MarkdownPreview";
import { DocumentController } from "../document/controller";
import { FakeBridge } from "../native/fakeBridge";
import { completeCodeFence, insertCodeBlock } from "./codeBlocks";

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

it.each(["lf", "crlf"] as const)(
  "completes a typed fence and preserves %s",
  (eol) => {
    const view = new EditorView({
      state: createBuffer("```js", { encoding: "utf-8", eol }),
    });
    cleanups.push(() => view.destroy());
    view.dispatch({ selection: { anchor: 5 } });
    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(serialize(view.state)).toBe(
      eol === "lf" ? "```js\n\n```" : "```js\r\n\r\n```",
    );
    expect(view.state.selection.main.head).toBe(6);
  },
);

it("inserts a code block around a selection as one undoable edit", async () => {
  const controller = new DocumentController(
    document.createElement("div"),
    new FakeBridge(),
  );
  cleanups.push(() => controller.dispose());
  await controller.initialize();
  controller.view.dispatch({
    changes: { from: 0, insert: "前文\n\nconst x = 1;\n\n后文" },
    selection: { anchor: 4, head: 16 },
  });
  await controller.command("edit.codeBlock");
  expect(controller.text()).toBe("前文\n\n```\nconst x = 1;\n```\n\n后文");
  controller.undo();
  expect(controller.text()).toBe("前文\n\nconst x = 1;\n\n后文");
});

it("highlights code safely while preserving literal contents and language labels", () => {
  const { container } = render(
    <MarkdownContent
      text={
        '```js\nconst x = "<img src=x onerror=alert(1)>";\n```\n\n```unknown\n**literal**\n```'
      }
    />,
  );
  expect(container.querySelector(".tok-keyword")).toHaveTextContent("const");
  expect(screen.getByText("js")).toBeInTheDocument();
  expect(container.querySelector("pre code")?.textContent).toBe(
    'const x = "<img src=x onerror=alert(1)>";\n',
  );
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelectorAll("pre code")[1].textContent).toBe(
    "**literal**\n",
  );
});

it.each([
  { text: "```js\ncode\n```", pos: 5 },
  { text: "```js\ncode\n```", pos: 14 },
  { text: "````text\n```", pos: 12 },
  { text: "    ```", pos: 7 },
  { text: "普通段落 ```", pos: 8 },
])(
  "does not complete existing or non-opening fences: $text at $pos",
  ({ text, pos }) => {
    const view = new EditorView({
      state: createBuffer(text, { encoding: "utf-8", eol: "lf" }),
    });
    cleanups.push(() => view.destroy());
    view.dispatch({ selection: { anchor: pos } });
    expect(completeCodeFence(view)).toBe(false);
    expect(serialize(view.state)).toBe(text);
  },
);

it("completes indented tilde fences", () => {
  const view = new EditorView({
    state: createBuffer("  ~~~~python", { encoding: "utf-8", eol: "lf" }),
  });
  cleanups.push(() => view.destroy());
  view.dispatch({ selection: { anchor: 12 } });
  expect(completeCodeFence(view)).toBe(true);
  expect(serialize(view.state)).toBe("  ~~~~python\n  \n  ~~~~");
  expect(view.state.selection.main.head).toBe(15);
});

it("wraps selected backticks with a longer fence without changing CRLF or spaces", () => {
  const source = "```js\r\n  x  \r\n```";
  const view = new EditorView({
    state: createBuffer(source, { encoding: "utf-8-bom", eol: "crlf" }),
  });
  cleanups.push(() => view.destroy());
  view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
  expect(insertCodeBlock(view)).toBe(true);
  expect(serialize(view.state)).toBe(
    "````\r\n```js\r\n  x  \r\n```\r\n````\r\n\r\n",
  );
});

it("does not modify readonly buffers", () => {
  const view = new EditorView({
    state: createBuffer("```", { encoding: "utf-8", eol: "lf" }, true),
  });
  cleanups.push(() => view.destroy());
  view.dispatch({ selection: { anchor: 3 } });
  expect(completeCodeFence(view)).toBe(false);
  expect(insertCodeBlock(view)).toBe(false);
  expect(serialize(view.state)).toBe("```");
});

it("renders unfinished code blocks without leaking reference definitions into code", () => {
  const source = "[ref]: https://example.com\n\n```text\nexample";
  const view = new EditorView({
    state: createBuffer(
      source,
      { encoding: "utf-8", eol: "lf" },
      false,
      [],
      "live",
    ),
  });
  cleanups.push(() => view.destroy());
  expect(view.dom.querySelector("pre code")?.textContent).toBe("example\n");
  expect(serialize(view.state)).toBe(source);
});
