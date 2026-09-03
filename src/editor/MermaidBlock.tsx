import { useEffect, useState } from "react";
import { renderMermaid, type MermaidRenderResult, type MermaidTheme } from "./mermaid";

interface MermaidBlockProps {
  source: string;
  theme: MermaidTheme;
  onChange?(source: string): void;
}

export function MermaidBlock({ source, theme, onChange }: MermaidBlockProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(source);
  const [result, setResult] = useState<MermaidRenderResult | null>(null);

  useEffect(() => {
    let active = true;
    void renderMermaid(source, theme).then((next) => {
      if (active) setResult(next);
    });
    return () => {
      active = false;
    };
  }, [source, theme]);

  if (editing) {
    return (
      <div className="mermaid-editor">
        <textarea aria-label="Mermaid 源码" value={draft} onChange={(event) => setDraft(event.target.value)} />
        <button onClick={() => {
          onChange?.(draft);
          setEditing(false);
        }}>完成</button>
      </div>
    );
  }

  return (
    <button className="mermaid-block" onClick={() => setEditing(true)}>
      {!result ? <span>正在渲染图表…</span> : result.ok ? (
        <span dangerouslySetInnerHTML={{ __html: result.svg }} />
      ) : (
        <span className="mermaid-error">
          <strong>Mermaid 语法错误</strong>
          <small>{result.error}</small>
          <code>{result.source}</code>
        </span>
      )}
    </button>
  );
}
