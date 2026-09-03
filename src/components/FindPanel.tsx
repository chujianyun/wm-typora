import { useMemo, useState } from "react";

interface FindPanelProps {
  markdown: string;
  onReplace(markdown: string): void;
  onClose(): void;
}

export function FindPanel({ markdown, onReplace, onClose }: FindPanelProps) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const matches = useMemo(() => {
    if (!query) return 0;
    let count = 0;
    let index = 0;
    while ((index = markdown.indexOf(query, index)) >= 0) {
      count += 1;
      index += query.length;
    }
    return count;
  }, [markdown, query]);

  return (
    <section className="find-panel" aria-label="查找与替换">
      <input autoFocus type="search" aria-label="查找" placeholder="查找" value={query} onChange={(event) => setQuery(event.target.value)} />
      <span className="match-count">{matches ? `1 / ${matches}` : "0 / 0"}</span>
      <input aria-label="替换为" placeholder="替换为" value={replacement} onChange={(event) => setReplacement(event.target.value)} />
      <button disabled={!query} onClick={() => onReplace(markdown.replaceAll(query, replacement))}>全部替换</button>
      <button aria-label="关闭查找" onClick={onClose}>×</button>
    </section>
  );
}
