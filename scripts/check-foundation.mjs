import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("../", import.meta.url));
const checks = [
  ["node", "scripts/verify-corpus.mjs"],
  ["npm", "run", "format:check"],
  ["npm", "run", "typecheck"],
  ["npm", "run", "lint"],
  ["npm", "test"],
  ["npm", "run", "build"],
  ["cargo", "fmt", "--all", "--", "--check"],
  // The desktop test binary links the Tauri/WebView2 runtime and cannot start
  // on headless Windows runners (STATUS_ENTRYPOINT_NOT_FOUND); its unit tests
  // still run on macOS and Ubuntu, and clippy --all-targets keeps compile
  // coverage of the test code on Windows.
  process.platform === "win32"
    ? ["cargo", "test", "-p", "wtypora-document-core", "--locked"]
    : ["cargo", "test", "--workspace", "--locked"],
  [
    "cargo",
    "clippy",
    "--workspace",
    "--all-targets",
    "--locked",
    "--",
    "-D",
    "warnings",
  ],
];
for (const [command, ...args] of checks) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(
    process.platform === "win32" && command === "npm" ? "npm.cmd" : command,
    args,
    {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32" && command === "npm",
    },
  );
  if (result.error) console.error(result.error);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
