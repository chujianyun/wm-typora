interface ConfirmDialogProps {
  onSave(): void;
  onDiscard(): void;
  onCancel(): void;
}

export function ConfirmDialog({ onSave, onDiscard, onCancel }: ConfirmDialogProps) {
  return (
    <div className="dialog-backdrop">
      <section role="dialog" aria-modal="true" aria-label="保存更改" className="dialog-card">
        <h2>保存更改</h2>
        <p>当前文档包含尚未保存的内容。</p>
        <div className="dialog-actions">
          <button onClick={onCancel}>取消</button>
          <button className="danger" onClick={onDiscard}>放弃</button>
          <button className="primary" onClick={onSave}>保存</button>
        </div>
      </section>
    </div>
  );
}
