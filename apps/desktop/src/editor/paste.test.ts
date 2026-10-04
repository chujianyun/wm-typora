import { afterEach, describe, expect, it } from "vitest";
import { EditorView } from "@codemirror/view";
import { undo, redo } from "@codemirror/commands";
import { createBuffer, serialize } from "./buffer";

let view: EditorView | undefined;
afterEach(() => {
  view?.destroy();
  document.body.innerHTML = "";
});

describe.each(["lf", "crlf"] as const)("paste into %s documents", (eol) => {
  it.each(["\n", "\r\n", "\r", "mixed"])(
    "normalizes %j clipboard line endings and preserves undo/redo",
    (inputEol) => {
      const separator = eol === "crlf" ? "\r\n" : "\n";
      const original = `原文  ${separator}`;
      view = new EditorView({
        state: createBuffer(original, { encoding: "utf-8-bom", eol }),
        parent: document.body,
      });
      view.dispatch({ selection: { anchor: view.state.doc.length } });
      const lines = ["# 中文 🦀", "", "正文  ", "结尾", ""];
      const input =
        inputEol === "mixed"
          ? "# 中文 🦀\r\n\r正文  \n结尾\r\n"
          : lines.join(inputEol);
      const paste = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(paste, "clipboardData", {
        value: { getData: () => input, files: [] },
      });
      view.contentDOM.dispatchEvent(paste);
      const expected = original + lines.join(separator);
      expect(serialize(view.state)).toBe(expected);
      expect(view.state.doc.lines).toBe(6);
      expect(undo(view)).toBe(true);
      expect(serialize(view.state)).toBe(original);
      expect(redo(view)).toBe(true);
      expect(serialize(view.state)).toBe(expected);
    },
  );
});
