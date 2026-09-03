import DOMPurify from "dompurify";

function safeUrl(value: string, image: boolean) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.startsWith("#") || normalized.startsWith("/") || normalized.startsWith("./") || normalized.startsWith("../")) return true;
  if (normalized.startsWith("http:") || normalized.startsWith("https:")) return true;
  if (!image && normalized.startsWith("mailto:")) return true;
  return image && normalized.startsWith("data:image/");
}

export function sanitizeExportHtml(html: string) {
  const sanitized = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "base"],
    FORBID_ATTR: ["srcdoc"],
    ALLOW_DATA_ATTR: true,
  });
  const root = document.createElement("div");
  root.innerHTML = sanitized;

  root.querySelectorAll<HTMLElement>("[href], [src]").forEach((element) => {
    const attribute = element.hasAttribute("href") ? "href" : "src";
    const value = element.getAttribute(attribute) ?? "";
    if (!safeUrl(value, element.tagName === "IMG")) element.removeAttribute(attribute);
  });
  root.querySelectorAll<HTMLAnchorElement>("a[target='_blank']").forEach((link) => {
    link.rel = "noopener noreferrer";
  });
  return root.innerHTML;
}
