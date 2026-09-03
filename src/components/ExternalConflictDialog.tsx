export function ExternalConflictDialog({ onReload, onKeep }: {
  onReload(): void;
  onKeep(): void;
}) {
  return (
    <div className="dialog-backdrop">
      <section role="dialog" aria-modal="true" aria-label="外部修改冲突" className="dialog-card">
        <h2>文件已在其他位置修改</h2>
        <p>重新载入会丢弃当前编辑；保留当前版本会等到下次显式保存时覆盖磁盘。</p>
        <div className="dialog-actions">
          <button onClick={onKeep}>保留当前版本</button>
          <button className="primary" onClick={onReload}>重新载入</button>
        </div>
      </section>
    </div>
  );
}
