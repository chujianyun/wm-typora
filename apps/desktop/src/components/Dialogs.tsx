import { useEffect, useRef } from "react";
import type { DocumentController, UIState } from "../document/controller";
export function Dialogs({
  ui,
  controller: c,
}: {
  ui: UIState;
  controller: DocumentController;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    modal = ui.modal!;
  useEffect(() => {
    const d = ref.current!;
    if (d.showModal) d.showModal();
    else d.setAttribute("open", "");
    return () => d.close?.();
  }, []);
  return (
    <dialog
      ref={ref}
      className={"dialog " + (modal.kind === "conflict" ? "wide" : "")}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        void c.cancelModal();
      }}
    >
      {modal.kind === "close" ? (
        <>
          <h2 id="dialog-title">保存对文档的更改？</h2>
          <p>你可以保存后关闭，或放弃此窗口中的更改。</p>
          <div className="dialog-actions">
            <button
              className="danger"
              disabled={ui.busy}
              onClick={() => void c.discardAndClose()}
            >
              放弃更改
            </button>
            <button
              autoFocus
              disabled={ui.busy}
              onClick={() => void c.cancelModal()}
            >
              取消
            </button>
            <button
              className="primary"
              disabled={ui.busy}
              onClick={() => void c.saveAndClose()}
            >
              保存并关闭
            </button>
          </div>
        </>
      ) : modal.kind === "conflict" ? (
        <>
          <h2 id="dialog-title">文件在外部发生了变化</h2>
          <p>比较两个版本，然后选择保留方式。另存为可以保留当前编辑。</p>
          <div className="comparison">
            <section>
              <h3>当前编辑</h3>
              <pre>{c.text()}</pre>
            </section>
            <section>
              <h3>磁盘版本</h3>
              <pre>{modal.disk ?? "文件暂不可读取或已被删除。"}</pre>
            </section>
          </div>
          <div className="dialog-actions">
            <button
              autoFocus
              disabled={ui.busy}
              onClick={() => void c.cancelModal()}
            >
              取消
            </button>
            <button
              disabled={ui.busy || modal.disk === null}
              onClick={() => void c.adoptDisk()}
            >
              采用磁盘版本
            </button>
            <button
              className="primary"
              disabled={ui.busy}
              onClick={() => void c.save(true)}
            >
              当前版本另存为…
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 id="dialog-title">发现未保存的草稿</h2>
          <p>恢复会创建未命名文档，不会覆盖原文件。</p>
          <ul className="recovery-list">
            {modal.snapshots.map((s) => (
              <li key={s.recoveryId}>
                <div>
                  <strong>
                    {s.sourcePath?.split(/[\\/]/).at(-1) ?? "未命名草稿"}
                  </strong>
                  <small>{s.updatedAt}</small>
                  <p>{s.text.slice(0, 110)}</p>
                </div>
                <button disabled={ui.busy} onClick={() => void c.restore(s)}>
                  恢复
                </button>
                <button
                  className="danger"
                  disabled={ui.busy}
                  onClick={() => void c.ignoreRecovery(s.recoveryId)}
                >
                  丢弃
                </button>
              </li>
            ))}
          </ul>
          <div className="dialog-actions">
            <button
              autoFocus
              disabled={ui.busy}
              onClick={() => void c.cancelModal()}
            >
              稍后处理
            </button>
          </div>
        </>
      )}
      {ui.warning && (
        <p className="dialog-error" role="alert">
          {ui.warning}
        </p>
      )}
    </dialog>
  );
}
