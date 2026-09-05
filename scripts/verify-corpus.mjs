import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../fixtures/markdown/", import.meta.url));
// Fixed bytes and hashes: --create fills missing fixtures only, never refreshes expectations.
const samples = [
  [
    "empty.md",
    "",
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  ],
  [
    "lf.md",
    "# 标题\n\n中文 👩🏽‍💻 é\n\n- [ ] 任务\n",
    "6250cc229000ca8ac4b737ea9e48fd1751f5995598c72551e3a7b630a32e0855",
  ],
  [
    "crlf.md",
    "# 标题\r\n\r\n正文\r\n",
    "ff6c44ba6ecee561dc923a851bb7aec7bd4cc8c4bb9417fee7e9e6c4fd3e96b7",
  ],
  [
    "bom.md",
    "\ufeff# BOM\n正文\n",
    "fa5e3b8cf8ffdc52e63b749ed801e824f431f10eae864097d441483467a4325b",
  ],
  [
    "no-final-newline.md",
    "# 无末尾换行\n\n**正文**",
    "bd65ce15b34036703263f85be46392aca3c93ba82de2c084b0804e3e8361f9e5",
  ],
  [
    "unknown.md",
    '---\nkey: custom\n---\n\n:::unknown\n$xyz$\n<div data-x="1">raw</div>\n::: \n\n```alien\nx\n```\n',
    "8cd8828f59bf3203a113ea6fcd1f6ba5bfa9bcb085e5380eeb44e599163af9e1",
  ],
  [
    "mixed.md",
    "one\r\ntwo\n",
    "611912c05d6113dd9932610cf2d5876c6f05324e05f326a40620dd4f3fd4ac0d",
  ],
  [
    "cr.md",
    "one\rtwo\r",
    "bccbc54e5d50f2a59ed94b37795c3614d186c251e67ee2c058c5e2df79d3ab02",
  ],
  [
    "invalid.bin",
    [255, 254, 0],
    "ba778c0261008c8f71ae4061ad0162ffcbe63b52c91f89f236738131d1217ec7",
  ],
  [
    "nul.bin",
    [97, 0, 98],
    "59b271ae1bbcb1d31d41929817f4b16fb439eb4f31520b5ad1d5ce98920a7138",
  ],
];
if (process.argv.includes("--create")) mkdirSync(dir, { recursive: true });
for (const [name, source, hash] of samples) {
  const path = dir + name;
  if (process.argv.includes("--create") && !existsSync(path))
    writeFileSync(path, Buffer.from(source), { flag: "wx" });
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (actual !== hash)
    throw new Error(
      `Corpus changed: ${name}, expected ${hash}, received ${actual}`,
    );
}
console.log(`Corpus: ${samples.length} immutable SHA-256 checks passed`);
