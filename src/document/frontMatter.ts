export interface FrontMatterDocument {
  body: string;
  frontMatter: string | null;
  prefix: string;
}

export function splitFrontMatter(markdown: string): FrontMatterDocument {
  const opening = markdown.match(/^---\r?\n/);
  if (!opening) return { body: markdown, frontMatter: null, prefix: "" };

  const remainder = markdown.slice(opening[0].length);
  const closing = /^---(?:\r?\n|$)/m.exec(remainder);
  if (!closing) return { body: markdown, frontMatter: null, prefix: "" };

  const prefixLength = opening[0].length + closing.index + closing[0].length;
  const rawFrontMatter = remainder.slice(0, closing.index);
  const frontMatter = rawFrontMatter.endsWith("\r\n")
    ? rawFrontMatter.slice(0, -2)
    : rawFrontMatter.endsWith("\n")
      ? rawFrontMatter.slice(0, -1)
      : rawFrontMatter;
  return {
    body: markdown.slice(prefixLength),
    frontMatter,
    prefix: markdown.slice(0, prefixLength),
  };
}
