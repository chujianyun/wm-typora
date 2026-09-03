export interface DocumentStatistics {
  words: number;
  characters: number;
  lines: number;
  readingMinutes: number;
}

function readableText(markdown: string) {
  return markdown
    .replace(/^---\s*$[\s\S]*?^---\s*$/m, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}(?:>|[-+*]|\d+[.)])\s+/gm, "")
    .replace(/[\s*_~]+/g, " ")
    .trim();
}

export function calculateStatistics(markdown: string): DocumentStatistics {
  const text = readableText(markdown);
  const cjkCharacters = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length ?? 0;
  const latinWords = text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.filter(
    (word) => !/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+$/u.test(word),
  ).length ?? 0;
  const words = cjkCharacters + latinWords;

  return {
    words,
    characters: text.replace(/\s/gu, "").length,
    lines: markdown.split(/\r?\n/).length,
    readingMinutes: words === 0 ? 0 : Math.max(1, Math.ceil(words / 200)),
  };
}
