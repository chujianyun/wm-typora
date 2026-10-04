import { EditorState, Compartment, type Extension } from "@codemirror/state";
import { history } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { syntaxHighlighting } from "@codemirror/language";
import { classHighlighter } from "@lezer/highlight";
import { codeLanguage } from "./codeLanguages";
import { codeBlockKeymap } from "./codeBlocks";
import { liveMarkdown } from "./liveMarkdown";
import { richClipboard } from "./clipboard";
import type { Format } from "../document/protocol";
const display = new Compartment();
export function createBuffer(
  text: string,
  format: Format,
  readOnly = false,
  extra: Extension[] = [],
  mode: "source" | "live" = "source",
): EditorState {
  return EditorState.create({
    doc: text,
    extensions: [
      EditorState.lineSeparator.of(format.eol === "crlf" ? "\r\n" : "\n"),
      // An explicit line separator disables CodeMirror's automatic detection.
      // Normalize clipboard input before it is split into document lines.
      EditorView.clipboardInputFilter.of((text, state) =>
        text.replace(/\r\n?|\n/g, state.lineBreak),
      ),
      EditorState.readOnly.of(readOnly),
      history(),
      richClipboard,
      markdown({ codeLanguages: codeLanguage }),
      syntaxHighlighting(classHighlighter),
      codeBlockKeymap,
      display.of(mode === "live" ? liveMarkdown : []),
      ...extra,
    ],
  });
}
export function serialize(state: EditorState) {
  return state.sliceDoc();
}
export function setDisplayMode(view: EditorView, mode: "source" | "live") {
  view.dispatch({
    effects: display.reconfigure(mode === "live" ? liveMarkdown : []),
  });
}
