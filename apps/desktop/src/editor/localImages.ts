import type { NativeBridge } from "../native/bridge";

// Rendered blocks are static markup, so local file bytes can only arrive after
// mount. The active document's controller registers a loader bound to its own
// bridge and session path; each window holds a single document at a time.
let loader: ((source: string) => Promise<string>) | null = null;

export function setLocalImageLoader(
  next: ((source: string) => Promise<string>) | null,
) {
  loader = next;
}

export function localImageDataURL(bytes: number[], mime: string) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.slice(i, i + 8192));
  return `data:${mime};base64,${btoa(binary)}`;
}

export function bridgeImageLoader(
  bridge: NativeBridge,
  documentPath: () => string | null,
) {
  const cache = new Map<string, Promise<string>>();
  return async (source: string): Promise<string> => {
    const path = documentPath();
    const key = `${path ?? ""}|${source}`;
    let pending = cache.get(key);
    if (!pending) {
      pending = bridge
        .readLocalImage(source, path)
        .then((file) => localImageDataURL(file.bytes, file.mime));
      if (cache.size >= 50) cache.delete(cache.keys().next().value!);
      cache.set(key, pending);
      pending.catch(() => {
        if (cache.get(key) === pending) cache.delete(key);
      });
    }
    return pending;
  };
}

export function resolveLocalImage(source: string): Promise<string> {
  if (!loader) return Promise.reject(new Error("本地图片加载器未注册"));
  return loader(source);
}
