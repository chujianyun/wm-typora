import { EditorSelection } from "@codemirror/state";
import { isolateHistory } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";

function editable(view: EditorView) {
  return (
    !view.state.readOnly &&
    !view.composing &&
    view.state.selection.ranges.length === 1
  );
}
export function toggleEmphasis(view: EditorView, marker: "**" | "*") {
  if (!editable(view)) return;
  const { from, to, empty } = view.state.selection.main;
  if (empty) return;
  const text = view.state.sliceDoc(from, to),
    n = marker.length;
  const surrounding =
    from >= n &&
    view.state.sliceDoc(from - n, from) === marker &&
    view.state.sliceDoc(to, to + n) === marker;
  // Three stars carry both emphasis types; two carry bold only.
  const before =
    /\*+$/.exec(view.state.sliceDoc(Math.max(0, from - 3), from))?.[0].length ??
    0;
  const after =
    /^\*+/.exec(
      view.state.sliceDoc(to, Math.min(view.state.doc.length, to + 3)),
    )?.[0].length ?? 0;
  const supports = (count: number) => (n === 2 ? count >= 2 : count % 2 === 1);
  const canUnwrap = surrounding && supports(before) && supports(after);
  const wrapped =
    text.length > n * 2 &&
    supports(/^\*+/.exec(text)?.[0].length ?? 0) &&
    supports(/\*+$/.exec(text)?.[0].length ?? 0);
  const start = canUnwrap ? from - n : from;
  const insert = canUnwrap
    ? text
    : wrapped
      ? text.slice(n, -n)
      : marker + text + marker;
  view.dispatch({
    changes: { from: start, to: canUnwrap ? to + n : to, insert },
    selection: EditorSelection.range(
      start + (canUnwrap || wrapped ? 0 : n),
      start + insert.length - (canUnwrap || wrapped ? 0 : n),
    ),
    annotations: isolateHistory.of("full"),
    userEvent: "input.format",
  });
  view.focus();
}
export function setHeading(view: EditorView, level: number) {
  if (!editable(view) || level < 0 || level > 6) return;
  const { from, to } = view.state.selection.main;
  const first = view.state.doc.lineAt(from),
    last = view.state.doc.lineAt(
      to > from && view.state.doc.lineAt(to).from === to ? to - 1 : to,
    );
  const changes = [];
  for (let i = first.number; i <= last.number; i++) {
    const line = view.state.doc.line(i);
    const prefix = /^( {0,3})(#{1,6}(?:\s+|$))?/.exec(line.text)!;
    changes.push({
      from: line.from,
      to: line.from + prefix[0].length,
      insert: level ? "#".repeat(level) + " " : prefix[1],
    });
  }
  const changeSet = view.state.changes(changes);
  view.dispatch({
    changes: changeSet,
    selection: view.state.selection.map(changeSet),
    annotations: isolateHistory.of("full"),
    userEvent: "input.format",
  });
  view.focus();
}
export function insertAddress(
  view: EditorView,
  address: string,
  image: boolean,
) {
  if (!editable(view)) return false;
  let url: URL;
  try {
    url = new URL(address.trim());
  } catch {
    return false;
  }
  if (
    !(image ? ["https:", "http:"] : ["https:", "http:", "mailto:"]).includes(
      url.protocol,
    )
  )
    return false;
  const { from, to } = view.state.selection.main;
  const label = view.state
    .sliceDoc(from, to)
    .replace(/\\/g, "\\\\")
    .replace(/[\[\]]/g, "\\$&")
    .replace(/\r?\n/g, " ");
  const safe = url.href.replace(
    /[()<>]/g,
    (c) => `%${c.charCodeAt(0).toString(16)}`,
  );
  const insert = `${image ? "!" : ""}[${label}](${safe})`;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    annotations: isolateHistory.of("full"),
    userEvent: "input.format",
  });
  view.focus();
  return true;
}
