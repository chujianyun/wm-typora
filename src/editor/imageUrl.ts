import { convertFileSrc } from "@tauri-apps/api/core";

type FileUrlConverter = (path: string) => string;

function decodePath(path: string) {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export function markdownImageAlt(fileName: string) {
  return fileName
    .replace(/[\r\n]+/g, " ")
    .replace(/([\\[\]])/g, "\\$1");
}

export function markdownImageUrl(path: string) {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function resolveImageFilePath(url: string, documentPath: string | null) {
  if (!documentPath || /^(?:https?:|data:|blob:|asset:|#)/i.test(url)) return null;

  const normalizedDocument = documentPath.replace(/\\/g, "/");
  const normalizedUrl = url.replace(/\\/g, "/");
  let absolutePath: string;
  if (/^file:/i.test(normalizedUrl)) {
    absolutePath = decodePath(new URL(normalizedUrl).pathname);
  } else if (/^(?:\/|[a-z]:\/)/i.test(normalizedUrl)) {
    absolutePath = decodePath(normalizedUrl);
  } else if (/^[a-z][a-z\d+.-]*:/i.test(normalizedUrl)) {
    return null;
  } else {
    const base = normalizedDocument.startsWith("/")
      ? `file://${encodeURI(normalizedDocument)}`
      : `file:///${encodeURI(normalizedDocument)}`;
    absolutePath = decodePath(new URL(normalizedUrl, base).pathname);
  }

  if (/^\/[a-z]:\//i.test(absolutePath)) absolutePath = absolutePath.slice(1);
  return absolutePath;
}

export function resolveImageDomUrl(
  url: string,
  documentPath: string | null,
  convert: FileUrlConverter = convertFileSrc,
) {
  const path = resolveImageFilePath(url, documentPath);
  return path ? convert(path) : url;
}
