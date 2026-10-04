import { afterEach, expect, it } from "vitest";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { history, undo } from "@codemirror/commands";
import { insertAddress, setHeading, toggleEmphasis } from "./formatting";
const views: EditorView[] = [];
function editor(doc: string, from = 0, to = doc.length, readOnly = false) {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: from, head: to },
      extensions: [history(), EditorState.readOnly.of(readOnly)],
    }),
    parent: document.body,
  });
  views.push(view);
  return view;
}
afterEach(() => views.splice(0).forEach((v) => v.destroy()));
it("toggles emphasis without losing selection and isolates undo", () => {
  for (const marker of ["*", "**"] as const) {
    const v = editor("hello");
    toggleEmphasis(v, marker);
    expect(v.state.doc.toString()).toBe(marker + "hello" + marker);
    expect(
      v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to),
    ).toBe("hello");
    toggleEmphasis(v, marker);
    expect(v.state.doc.toString()).toBe("hello");
    undo(v);
    expect(v.state.doc.toString()).toBe(marker + "hello" + marker);
  }
});
it("changes selected paragraphs without including the next line boundary", () => {
  const v = editor("# one\ntwo\nthree", 0, 10);
  setHeading(v, 3);
  expect(v.state.doc.toString()).toBe("### one\n### two\nthree");
  setHeading(v, 0);
  expect(v.state.doc.toString()).toBe("one\ntwo\nthree");
  undo(v);
  expect(v.state.doc.toString()).toBe("### one\n### two\nthree");
});
it("escapes link labels, rejects unsafe addresses and supports undo", () => {
  const v = editor("a[b]");
  expect(insertAddress(v, "javascript:alert(1)", false)).toBe(false);
  expect(v.state.doc.toString()).toBe("a[b]");
  expect(insertAddress(v, "https://example.com/a(b)", false)).toBe(true);
  expect(v.state.doc.toString()).toBe(
    "[a\\[b\\]](https://example.com/a%28b%29)",
  );
  undo(v);
  expect(v.state.doc.toString()).toBe("a[b]");
  expect(insertAddress(v, "https://example.com/image.png", true)).toBe(true);
  expect(v.state.doc.toString()).toBe(
    "![a\\[b\\]](https://example.com/image.png)",
  );
});
it("never changes a read-only document", () => {
  const v = editor("hello", 0, 5, true);
  toggleEmphasis(v, "**");
  setHeading(v, 2);
  insertAddress(v, "https://example.com", false);
  expect(v.state.doc.toString()).toBe("hello");
});
it("toggles italic independently inside combined bold and italic", () => {
  const v = editor("hello");
  toggleEmphasis(v, "**");
  toggleEmphasis(v, "*");
  expect(v.state.doc.toString()).toBe("***hello***");
  toggleEmphasis(v, "*");
  expect(v.state.doc.toString()).toBe("**hello**");
  toggleEmphasis(v, "**");
  expect(v.state.doc.toString()).toBe("hello");
});
