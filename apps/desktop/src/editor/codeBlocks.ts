import { EditorSelection, Prec, type EditorState } from "@codemirror/state";
import { ensureSyntaxTree } from "@codemirror/language";
import { isolateHistory } from "@codemirror/commands";
import { keymap, type Command } from "@codemirror/view";

function codeBlockAt(state: EditorState, pos: number) {
  let node = ensureSyntaxTree(state, pos, 50)?.resolveInner(pos, -1);
  while (node) {
    if (node.name === "FencedCode" || node.name === "CodeBlock") return node;
    node = node.parent ?? undefined;
  }
  return null;
}

export const insertCodeBlock: Command = (view) => {
  const { state } = view;
  if (state.readOnly || view.composing || state.selection.ranges.length !== 1)
    return false;
  const { from, to, empty } = state.selection.main;
  if (empty && codeBlockAt(state, from)) return false;
  const content = state.doc.sliceString(from, to);
  // A longer fence keeps selected Markdown containing backticks literal.
  let longest = 2;
  for (const match of content.matchAll(/`+/g))
    longest = Math.max(longest, match[0].length);
  const fence = "`".repeat(longest + 1);
  const before = state.doc.sliceString(Math.max(0, from - 2), from);
  const after = state.doc.sliceString(to, Math.min(state.doc.length, to + 2));
  const prefix =
    !before || before.endsWith("\n\n")
      ? ""
      : before.endsWith("\n")
        ? "\n"
        : "\n\n";
  const suffix = after.startsWith("\n\n")
    ? ""
    : after.startsWith("\n")
      ? "\n"
      : "\n\n";
  const start = from + prefix.length + fence.length + 1;
  const insert =
    prefix +
    fence +
    "\n" +
    content +
    (content.endsWith("\n") ? "" : "\n") +
    fence +
    suffix;
  view.dispatch({
    changes: { from, to, insert: insert.replace(/\n/g, state.lineBreak) },
    selection: EditorSelection.cursor(start),
    annotations: isolateHistory.of("full"),
    userEvent: "input",
    scrollIntoView: true,
  });
  view.focus();
  return true;
};

export const completeCodeFence: Command = (view) => {
  const { state } = view;
  if (
    state.readOnly ||
    view.composing ||
    state.selection.ranges.length !== 1 ||
    !state.selection.main.empty
  )
    return false;
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  if (pos !== line.to) return false;
  const match = /^( {0,3})(`{3,}|~{3,})([^\n]*)$/.exec(line.text);
  if (!match || (match[2][0] === "`" && match[3].includes("`"))) return false;
  const block = codeBlockAt(state, pos);
  if (
    block?.name !== "FencedCode" ||
    block.from !== line.from + match[1].length
  )
    return false;
  const marks = block.getChildren("CodeMark");
  if (marks.length !== 1) return false;
  const indent = match[1];
  view.dispatch({
    changes: {
      from: pos,
      insert: state.lineBreak + indent + state.lineBreak + indent + match[2],
    },
    selection: { anchor: pos + 1 + indent.length },
    userEvent: "input",
    scrollIntoView: true,
  });
  return true;
};

export const codeBlockKeymap = Prec.highest(
  keymap.of([
    { key: "Mod-Alt-c", run: insertCodeBlock },
    { key: "Enter", run: completeCodeFence },
  ]),
);
