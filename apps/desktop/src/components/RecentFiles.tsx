import { useEffect, useRef, useState } from "react";
import type { NativeBridge } from "../native/bridge";

export function RecentFiles({
  bridge,
  onOpen,
  onClose,
}: {
  bridge: NativeBridge;
  onOpen: (path: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [paths, setPaths] = useState<string[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal?.();
    if (!dialog.showModal) dialog.setAttribute("open", "");
    let alive = true;
    void bridge.recentFiles().then(
      (files) => {
        if (alive) setPaths(files);
      },
      () => {
        if (alive) setError(true);
      },
    );
    return () => {
      alive = false;
      dialog.close?.();
    };
  }, [bridge]);
  return (
    <dialog
      ref={ref}
      className="dialog recent-dialog"
      aria-labelledby="recent-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2 id="recent-title">最近打开</h2>
      <p>最近使用的 10 个文件，点击即可打开。</p>
      {error ? (
        <p role="alert">无法读取最近打开记录，请关闭后重试。</p>
      ) : paths === null ? (
        <p role="status">正在读取…</p>
      ) : paths.length === 0 ? (
        <p>暂无最近打开的文件</p>
      ) : (
        <ol className="recent-files">
          {paths.map((path) => (
            <li key={path}>
              <button
                title={path}
                aria-label={`打开 ${path}`}
                onClick={() => onOpen(path)}
              >
                <strong>{path.split(/[\\/]/).at(-1)}</strong>
                <span>{path}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="dialog-actions">
        <button autoFocus onClick={onClose}>
          关闭
        </button>
      </div>
    </dialog>
  );
}
