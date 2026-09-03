import katex from "katex";
import { marked } from "marked";
import { renderMermaid, type MermaidTheme } from "../editor/mermaid";
import { sanitizeExportHtml } from "./sanitize";

interface BuildHtmlOptions {
  title: string;
  theme: MermaidTheme;
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
  const diagramJobs: Promise<void>[] = [];
  let index = 0;

  let prepared = markdown.replace(/^```mermaid\s*\n([\s\S]*?)^```\s*$/gim, (_block, source: string) => {
    const key = `diagram-${index++}`;
    diagramJobs.push(
      renderMermaid(source.trimEnd(), theme).then((result) => {
        replacements.set(
          key,
          result.ok
            ? `<figure class="mermaid-diagram">${result.svg}</figure>`
            : `<figure class="mermaid-error"><strong>Mermaid error</strong><pre><code>${escapeHtml(result.source)}</code></pre><small>${escapeHtml(result.error)}</small></figure>`,
        );
      }),
    );
    return `<div data-wtypora-slot="${key}"></div>`;
  });

  prepared = prepared.replace(/\$\$([\s\S]*?)\$\$/g, (_match, expression: string) => {
    const key = `math-${index++}`;
    replacements.set(
      key,
      katex.renderToString(expression.trim(), { displayMode: true, throwOnError: false, strict: "ignore" }),
    );
    return `<div data-wtypora-slot="${key}"></div>`;
  });
  prepared = prepared.replace(/(^|[^\\])\$([^$\n]+)\$/g, (_match, prefix: string, expression: string) => {
    const key = `math-${index++}`;
    replacements.set(
      key,
      katex.renderToString(expression, { throwOnError: false, strict: "ignore" }),
    );
    return `${prefix}<span data-wtypora-slot="${key}"></span>`;
  });

  await Promise.all(diagramJobs);
  let html = await marked.parse(prepared, { gfm: true, breaks: false, async: true });
  for (const [key, replacement] of replacements) {
    html = html
      .replace(`<div data-wtypora-slot="${key}"></div>`, replacement)
      .replace(`<span data-wtypora-slot="${key}"></span>`, replacement);
  }
  return sanitizeExportHtml(html);
}

const exportStyles = `
:root{color-scheme:light dark;--bg:#f7f5f0;--text:#292724;--muted:#736d65;--accent:#b95d30}
:root[data-theme=dark]{--bg:#1e1e1c;--text:#e9e5dd;--muted:#aaa39a;--accent:#e28753}
*{box-sizing:border-box}body{max-width:820px;margin:0 auto;padding:64px 28px 120px;color:var(--text);background:var(--bg);font:18px/1.8 "Iowan Old Style","Songti SC",Georgia,serif}
h1,h2,h3,h4{line-height:1.3;margin-top:1.8em}a{color:var(--accent)}img,svg{max-width:100%;height:auto}pre{overflow:auto;padding:18px;border-radius:10px;background:color-mix(in srgb,var(--text) 8%,transparent)}code{font-family:ui-monospace,SFMono-Regular,monospace}.mermaid-diagram{text-align:center}.mermaid-error{padding:16px;border-left:3px solid #b33}.katex{font:normal 1.12em KaTeX_Main,"Times New Roman",serif}.katex-display{display:block;margin:1em 0;text-align:center}
@media print{body{max-width:none;padding:0;background:white;color:black}@page{margin:18mm}}
`;

export async function buildHtmlDocument(markdown: string, options: BuildHtmlOptions) {
  const body = await renderMarkdown(markdown, options.theme);
  return `<!doctype html>
<html lang="zh-CN" data-theme="${options.theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(options.title)}</title>
<style>${exportStyles}</style>
</head>
<body>${body}</body>
</html>`;
}
