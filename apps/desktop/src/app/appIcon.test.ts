import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("explicitly bundles native icons for macOS, Windows, and Linux", () => {
  const root = resolve(process.cwd(), "src-tauri");
  const config = JSON.parse(
    readFileSync(resolve(root, "tauri.conf.json"), "utf8"),
  );
  expect(config.bundle.icon).toEqual(
    expect.arrayContaining([
      "icons/icon.icns",
      "icons/icon.ico",
      "icons/32x32.png",
      "icons/128x128.png",
    ]),
  );
  for (const path of config.bundle.icon)
    expect(existsSync(resolve(root, path))).toBe(true);
  expect(
    readFileSync(resolve(root, "icons/icon.icns")).subarray(0, 4).toString(),
  ).toBe("icns");
});
