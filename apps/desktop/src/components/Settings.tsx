import { useEffect, useRef } from "react";
import { themes, type Preferences } from "../settings/preferences";
export function Settings({
  value,
  onChange,
  onClose,
}: {
  value: Preferences;
  onChange: (value: Preferences) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal?.();
    if (!dialog.showModal) dialog.setAttribute("open", "");
    return () => dialog.close?.();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog settings-dialog"
      aria-labelledby="settings-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2 id="settings-title">设置</h2>
      <fieldset>
        <legend>外观主题</legend>
        <div className="theme-options">
          {themes.map((theme) => (
            <label key={theme.id} className={`theme-option theme-${theme.id}`}>
              <input
                type="radio"
                name="theme"
                value={theme.id}
                checked={value.theme === theme.id}
                onChange={() => onChange({ ...value, theme: theme.id })}
              />
              <span>
                <strong>{theme.name}</strong>
                <small>{theme.description}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>粘贴图片</legend>
        <label className="setting-row">
          图床软件
          <select
            value={value.upload.provider}
            onChange={(event) =>
              onChange({
                ...value,
                upload: {
                  ...value.upload,
                  provider: event.target
                    .value as Preferences["upload"]["provider"],
                },
              })
            }
          >
            <option value="none">不自动上传</option>
            <option value="picgo">PicGo 桌面版</option>
            <option value="picgo-core">PicGo-Core 命令行</option>
          </select>
        </label>
        {value.upload.provider === "picgo" && (
          <>
            <label className="setting-row">
              PicGo 服务地址
              <input
                spellCheck={false}
                value={value.upload.endpoint}
                onChange={(event) =>
                  onChange({
                    ...value,
                    upload: { ...value.upload, endpoint: event.target.value },
                  })
                }
              />
            </label>
            <p>
              请启动 PicGo，并在 PicGo 设置中开启 Server。使用 PicGo
              当前选中的图床上传。
            </p>
          </>
        )}
        {value.upload.provider === "picgo-core" && (
          <>
            <label className="setting-row">
              PicGo-Core 程序路径
              <input
                spellCheck={false}
                value={value.upload.executable}
                placeholder="例如 /opt/homebrew/bin/picgo"
                onChange={(event) =>
                  onChange({
                    ...value,
                    upload: { ...value.upload, executable: event.target.value },
                  })
                }
              />
            </label>
            <p>填写 picgo 可执行文件路径，使用该程序已配置的默认图床。</p>
          </>
        )}
        <label className="setting-row">
          图片插入格式
          <select
            value={value.upload.imageAlt}
            onChange={(event) =>
              onChange({
                ...value,
                upload: {
                  ...value.upload,
                  imageAlt: event.target
                    .value as Preferences["upload"]["imageAlt"],
                },
              })
            }
          >
            <option value="empty">图片链接（不带说明文字）</option>
            <option value="filename">图片链接（以文件名作为说明）</option>
          </select>
        </label>
        <p>
          插入示例：
          <code>
            {value.upload.imageAlt === "empty"
              ? "![](图片链接)"
              : "![文件名](图片链接)"}
          </code>
        </p>
        <p>
          {value.upload.provider === "none"
            ? "选择图床软件后，粘贴图片会自动上传并插入 Markdown 图片链接。"
            : "粘贴图片将上传到所选软件配置的图床；成功后在粘贴位置插入图片链接。支持 PNG、JPEG、GIF、WebP、BMP，每张最大 10 MB。"}
        </p>
      </fieldset>
      <div className="dialog-actions">
        <button autoFocus className="primary" onClick={onClose}>
          完成
        </button>
      </div>
    </dialog>
  );
}
