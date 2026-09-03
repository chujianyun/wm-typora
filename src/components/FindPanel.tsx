import { useMemo, useState } from "react";

interface FindPanelProps {
  countMatches(query: string): number;
  onReplace(query: string, replacement: string): void;
  onNavigate(query: string, occurrence: number): void;
  onClose(): void;
}

export function FindPanel({ countMatches, onReplace, onNavigate, onClose }: FindPanelProps) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [current, setCurrent] = useState(0);
  const matches = useMemo(() => {
    return query ? countMatches(query) : 0;
  }, [countMatches, query]);

  const currentMatch = matches ? Math.min(current, matches - 1) : 0;

  const move = (delta: number) => {
    if (!matches) return;
    const next = (currentMatch + delta + matches) % matches;
    setCurrent(next);
    onNavigate(query, next);
  };

  return (
    <section className="find-panel" aria-label="查找与替换">
      <input autoFocus type="search" aria-label="查找" placeholder="查找" value={query} onChange={(event) => {
        const next = event.target.value;
        setQuery(next);
        setCurrent(0);
        if (next && countMatches(next)) onNavigate(next, 0);
      }} />
      <span className="match-count">{matches ? `${currentMatch + 1} / ${matches}` : "0 / 0"}</span>
      <button aria-label="上一个匹配" disabled={!matches} onClick={() => move(-1)}>↑</button>
      <button aria-label="下一个匹配" disabled={!matches} onClick={() => move(1)}>↓</button>
      <input aria-label="替换为" placeholder="替换为" value={replacement} onChange={(event) => setReplacement(event.target.value)} />
      <button disabled={!query} onClick={() => onReplace(query, replacement)}>全部替换</button>
      <button aria-label="关闭查找" onClick={onClose}>×</button>
    </section>
  );
}
