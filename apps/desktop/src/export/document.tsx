import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { NativeBridge } from "../native/bridge";
import "./print.css";

export type ExportFormat = "docx" | "pdf";
export type ExportRequest = {
  format: ExportFormat;
  name: string;
  sourcePath: string | null;
  bytes?: number[];
};
export type ExportImage = { bytes: number[]; mime: string };
export type EmbeddedImage = { data: Uint8Array; width: number; height: number };

export function exportName(path: string | null, format: ExportFormat) {
  const name = path?.split(/[\\/]/).at(-1) || "无标题";
  return `${name.replace(/\.(md|markdown|mdown|mkd|txt)$/i, "")}.${format}`;
}

export function renderExport(text: string) {
  const root = document.createElement("article");
  root.id = "wtypora-export";
  root.setAttribute("aria-hidden", "true");
  // Export from the complete source snapshot, never CodeMirror's virtual viewport.
  root.innerHTML = renderToStaticMarkup(
    <Markdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      components={{
        img: ({ src, alt, title }) => (
          <img data-source={src || ""} alt={alt ?? ""} title={title} />
        ),
        input: ({ checked }) => <span>{checked ? "☑" : "☐"} </span>,
      }}
    >
      {text}
    </Markdown>,
  );
  return root;
}

function dataURL(bytes: number[], mime: string) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.slice(i, i + 8192));
  return `data:${mime};base64,${btoa(binary)}`;
}

async function embedImage(img: HTMLImageElement, file: ExportImage) {
  if (!/^image\/(png|jpeg|gif|webp|bmp)$/.test(file.mime))
    throw new Error("不支持的图片格式");
  await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      img.onload = img.onerror = null;
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => finish(new Error("图片解码超时")), 10000);
    img.onload = () => finish();
    img.onerror = () => finish(new Error("图片无法读取"));
    img.src = dataURL(file.bytes, file.mime);
  });
  if (!img.naturalWidth || img.naturalWidth * img.naturalHeight > 40_000_000)
    throw new Error("图片尺寸过大");
  // Word supports PNG consistently, including images originally in WebP/GIF.
  const scale = Math.min(1, 1600 / img.naturalWidth, 2200 / img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法处理图片");
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  const png = canvas.toDataURL("image/png");
  const data = Uint8Array.from(atob(png.split(",")[1]), (c) => c.charCodeAt(0));
  const fit = Math.min(1, 600 / canvas.width, 840 / canvas.height);
  return { data, width: canvas.width * fit, height: canvas.height * fit };
}

export async function exportSnapshot(
  bridge: NativeBridge,
  text: string,
  path: string | null,
  format: ExportFormat,
) {
  const root = renderExport(text);
  const images = new Map<Element, EmbeddedImage>();
  let missing = 0;
  let totalBytes = 0;
  const cache = new Map<string, Promise<ExportImage>>();
  document.body.append(root);
  try {
    for (const img of root.querySelectorAll("img")) {
      const source = img.dataset.source ?? "";
      try {
        const url = new URL(source);
        if (!["https:", "http:"].includes(url.protocol))
          throw new Error("暂不支持本地图片");
        let request = cache.get(url.href);
        if (!request) {
          request = bridge.exportImage(url.href);
          cache.set(url.href, request);
        }
        const file = await request;
        totalBytes += file.bytes.length;
        if (totalBytes > 40 * 1024 * 1024) throw new Error("图片总大小过大");
        images.set(img, await embedImage(img, file));
      } catch {
        missing++;
        const placeholder = document.createElement("span");
        placeholder.className = "export-image-missing";
        placeholder.textContent = `[图片未能导出：${img.alt || source || "无效链接"}]`;
        img.replaceWith(placeholder);
      }
    }
    const name = exportName(path, format);
    let bytes: number[] | undefined;
    if (format === "docx") {
      const { createDocx } = await import("./word");
      bytes = Array.from(await createDocx(root, images, name));
    } else {
      await document.fonts?.ready;
      // Allow WebKit to complete layout before invoking its native print operation.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    }
    const saved = await bridge.exportDocument({
      format,
      name,
      sourcePath: path,
      bytes,
    });
    return { path: saved, missing };
  } finally {
    root.remove();
  }
}
