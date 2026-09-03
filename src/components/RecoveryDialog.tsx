import type { RecoveryDraft } from "../document/recovery";

export function RecoveryDialog({ draft, onRecover, onIgnore }: {
  draft: RecoveryDraft;
  onRecover(): void;
  onIgnore(): void;
}) {
  return (
    <div className="dialog-backdrop">
      <section role="dialog" aria-modal="true" aria-label="恢复草稿" className="dialog-card">
        <h2>发现恢复草稿</h2>
        <p>上次写作的内容尚未成功保存。是否恢复？</p>
        <small>{new Date(draft.savedAt).toLocaleString()}</small>
        <div className="dialog-actions">
          <button onClick={onIgnore}>忽略</button>
          <button className="primary" onClick={onRecover}>恢复</button>
        </div>
      </section>
    </div>
  );
}
