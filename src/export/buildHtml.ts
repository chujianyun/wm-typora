import katex from "katex";
import { Marked } from "marked";
import markedFootnote from "marked-footnote";
import { renderMermaid, type MermaidTheme } from "../editor/mermaid";
import { sanitizeExportHtml } from "./sanitize";

interface BuildHtmlOptions {
  title: string;
  theme: MermaidTheme;
  sourcePath?: string | null;
  resolveImageUrl?: (url: string) => Promise<string> | string;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

async function renderMarkdown(markdown: string, theme: MermaidTheme) {
  const replacements = new Map<string, string>();
  const slotNamespace = crypto.randomUUID();
  let index = 0;
  const parser = new Marked({
    walkTokens(token) {
      if (token.type !== "code" || token.lang?.trim().toLowerCase() !== "mermaid") return;
      const source = token.text.trimEnd();
      const key = `${slotNamespace}-${index++}`;
      token.lang = "wtypora-mermaid-slot";
      token.text = key;
      return renderMermaid(source, theme).then((result) => {
        replacements.set(
          key,
          result.ok
            ? `<figure class="mermaid-diagram">${result.svg}</figure>`
            : `<figure class="mermaid-error"><strong>Mermaid error</strong><pre><code>${escapeHtml(result.source)}</code></pre><small>${escapeHtml(result.error)}</small></figure>`,
        );
      });
    },
    renderer: {
      code(token) {
        if (token.lang !== "wtypora-mermaid-slot") return false;
        return `<div data-wtypora-slot="${token.text}"></div>`;
      },
    },
  }).use(markedFootnote());

  let html = await parser.parse(markdown, { gfm: true, breaks: false, async: true });
  for (const [key, replacement] of replacements) {
    html = html
      .replace(`<div data-wtypora-slot="${key}"></div>`, replacement)
      .replace(`<span data-wtypora-slot="${key}"></span>`, replacement);
  }
  return sanitizeExportHtml(renderMathInTextNodes(html));
}

function renderMathInTextNodes(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const candidates: Text[] = [];

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement && !node.parentElement.closest("code, pre")) {
      candidates.push(node as Text);
    }
  }

  for (const node of candidates) {
    const value = node.data;
    const pattern = /\$\$([\s\S]+?)\$\$|(^|[^\\])\$([^$\n]+?)\$/g;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let changed = false;

    for (const match of value.matchAll(pattern)) {
      const start = match.index;
      fragment.append(value.slice(cursor, start));
      if (match[2]) fragment.append(match[2]);

      const template = document.createElement("template");
      template.innerHTML = katex.renderToString((match[1] ?? match[3]).trim(), {
        displayMode: match[1] !== undefined,
        output: "mathml",
        throwOnError: false,
        strict: "ignore",
      });
      fragment.append(template.content);
      cursor = start + match[0].length;
      changed = true;
    }

    if (changed) {
      fragment.append(value.slice(cursor));
      node.replaceWith(fragment);
    }
  }

  return root.innerHTML;
}

const exportStyles = `
:root{color-scheme:light dark;--bg:#f7f5f0;--text:#292724;--muted:#736d65;--accent:#b95d30}
:root[data-theme=dark]{--bg:#1e1e1c;--text:#e9e5dd;--muted:#aaa39a;--accent:#e28753}
*{box-sizing:border-box}body{max-width:820px;margin:0 auto;padding:64px 28px 120px;color:var(--text);background:var(--bg);font:18px/1.8 "Iowan Old Style","Songti SC",Georgia,serif}
h1,h2,h3,h4{line-height:1.3;margin-top:1.8em}a{color:var(--accent)}img,svg{max-width:100%;height:auto}pre{overflow:auto;padding:18px;border-radius:10px;background:color-mix(in srgb,var(--text) 8%,transparent)}code{font-family:ui-monospace,SFMono-Regular,monospace}.mermaid-diagram{text-align:center}.mermaid-error{padding:16px;border-left:3px solid #b33}.katex{font-size:1.12em}.katex math{font-family:math}.katex-display{display:block;margin:1em 0;text-align:center}.katex-display math{display:block;margin:auto}
@media print{body{max-width:none;padding:0;background:white;color:black}@page{margin:18mm}}
`;

export async function buildHtmlDocument(markdown: string, options: BuildHtmlOptions) {
  let body = await renderMarkdown(markdown, options.theme);
  if (options.resolveImageUrl) {
    body = await resolveImageUrls(body, options.resolveImageUrl);
  }
  const sourceDirectory = options.sourcePath
    ? fileDirectoryUrl(options.sourcePath)
    : null;
  return `<!doctype html>
<html lang="zh-CN" data-theme="${options.theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(options.title)}</title>
${sourceDirectory ? `<base href="${escapeHtml(sourceDirectory)}">` : ""}
<style>${exportStyles}</style>
</head>
<body>${body}</body>
</html>`;
}

async function resolveImageUrls(
  html: string,
  resolve: (url: string) => Promise<string> | string,
) {
  const root = document.createElement("div");
  root.innerHTML = html;
  await Promise.all(
    [...root.querySelectorAll<HTMLImageElement>("img[src]")].map(async (image) => {
      const source = image.getAttribute("src");
      if (source) image.setAttribute("src", await resolve(source));
    }),
  );
  return root.innerHTML;
}

function fileDirectoryUrl(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const directory = normalized.slice(0, normalized.lastIndexOf("/") + 1);
  const encoded = directory
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
    .replace(/^([a-z])%3A\//i, "$1:/");
  return `${directory.startsWith("/") ? "file://" : "file:///"}${encoded}`;
}
