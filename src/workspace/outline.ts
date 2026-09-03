export interface OutlineItem {
  id: string;
  text: string;
  level: number;
  line: number;
  children: OutlineItem[];
}

function slugify(text: string) {
  const slug = text
    .toLocaleLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return slug || "section";
}

export function buildOutline(markdown: string): OutlineItem[] {
  const roots: OutlineItem[] = [];
  const stack: OutlineItem[] = [];
  const slugs = new Map<string, number>();
  let fence: string | null = null;

  const { body, prefix } = splitFrontMatter(markdown);
  const lineOffset = prefix ? prefix.split(/\r?\n/).length - 1 : 0;
  body.split(/\r?\n/).forEach((line, index) => {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      fence = fence === marker ? null : fence ?? marker;
      return;
    }
    if (fence) return;

    const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) return;

    const text = match[2].trim();
    const level = match[1].length;
    const base = slugify(text);
    const count = (slugs.get(base) ?? 0) + 1;
    slugs.set(base, count);
    const item: OutlineItem = {
      id: count === 1 ? base : `${base}-${count}`,
      text,
      level,
      line: lineOffset + index + 1,
      children: [],
    };

    while (stack.length > 0 && stack.at(-1)!.level >= level) stack.pop();
    const parent = stack.at(-1);
    if (parent) parent.children.push(item);
    else roots.push(item);
    stack.push(item);
  });

  return roots;
}
import { splitFrontMatter } from "../document/frontMatter";
