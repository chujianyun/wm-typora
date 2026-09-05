import { EditorState, Compartment, type Extension } from "@codemirror/state";
import { history } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import type { Format } from "../document/protocol";
const display = new Compartment();
export function createBuffer(
  text: string,
  format: Format,
  readOnly = false,
  extra: Extension[] = [],
): EditorState {
  return EditorState.create({
    doc: text,
    extensions: [
      EditorState.lineSeparator.of(format.eol === "crlf" ? "\r\n" : "\n"),
      EditorState.readOnly.of(readOnly),
      history(),
      markdown(),
      display.of([]),
      ...extra,
    ],
  });
}
export function serialize(state: EditorState) {
  return state.sliceDoc();
}
export function setDisplayMode(view: EditorView, _mode: "source" | "live") {
  if (view.composing) return;
  view.dispatch({ effects: display.reconfigure([]) });
}
