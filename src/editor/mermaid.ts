import type { MermaidConfig } from "mermaid";

export const MERMAID_CONFIG = Object.freeze({
  securityLevel: "strict",
  startOnLoad: false,
  maxTextSize: 50_000,
  maxEdges: 500,
  flowchart: { htmlLabels: false },
  suppressErrorRendering: true,
} satisfies MermaidConfig);

export type MermaidTheme = "light" | "dark";

export type MermaidRenderResult =
  | { ok: true; svg: string }
  | { ok: false; source: string; error: string };

let renderSequence = 0;
let renderQueue: Promise<void> = Promise.resolve();
let mermaidModule: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  mermaidModule ??= import("mermaid").then((module) => module.default);
  return mermaidModule;
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function renderMermaid(
  source: string,
  theme: MermaidTheme,
): Promise<MermaidRenderResult> {
  const task = renderQueue.then(async (): Promise<MermaidRenderResult> => {
    if (source.length > MERMAID_CONFIG.maxTextSize) {
      return {
        ok: false,
        source,
        error: `Mermaid source exceeds ${MERMAID_CONFIG.maxTextSize} characters`,
      };
    }

    const id = `wtypora-mermaid-${++renderSequence}`;
    try {
      const mermaid = await loadMermaid();
      mermaid.initialize({
        ...MERMAID_CONFIG,
        theme: theme === "dark" ? "dark" : "default",
      });
      await mermaid.parse(source);
      const { svg } = await mermaid.render(id, source);
      return { ok: true, svg };
    } catch (error) {
      return { ok: false, source, error: messageFrom(error) };
    } finally {
      document.getElementById(id)?.remove();
    }
  });
  renderQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}
