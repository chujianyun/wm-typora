import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { it, expect } from "vitest";
import { createBuffer, serialize } from "./buffer";
import type { Format } from "../document/protocol";

const root = resolve(process.cwd(), "../../fixtures/markdown") + "/";
const samples = JSON.parse(readFileSync(root + "manifest.json", "utf8")) as {
  file: string;
  encoding: Format["encoding"];
  eol: Format["eol"];
  readOnly: boolean;
  reject?: boolean;
}[];
for (const sample of samples.filter((s) => !s.reject))
  it(`preserves corpus ${sample.file}`, () => {
    const original = readFileSync(root + sample.file, "utf8").replace(
      /^\uFEFF/,
      "",
    );
    const state = createBuffer(original, sample, sample.readOnly);
    expect(serialize(state)).toBe(original);
    expect(state.readOnly).toBe(sample.readOnly);
  });
