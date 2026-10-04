import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") {
  console.error("macOS bundle verification requires macOS.");
  process.exit(1);
}

const bundle =
  process.argv[2] ??
  fileURLToPath(
    new URL("../target/debug/bundle/macos/WTypora.app", import.meta.url),
  );

try {
  // Verify the complete bundle, including its sealed resources and Info.plist.
  // A linker-signed executable alone is not a valid signed application bundle.
  execFileSync(
    "/usr/bin/codesign",
    [
      "--verify",
      "--deep",
      "--strict",
      "--verbose=2",
      "-R",
      '=anchor apple generic and identifier "com.wuming.wtypora.foundation"',
      bundle,
    ],
    { stdio: "inherit" },
  );
  console.log(`Verified macOS application bundle: ${bundle}`);
} catch {
  console.error(
    "Bundle verification failed. Rebuild with the configured Apple certificate; ad-hoc signing cannot preserve permissions across builds.",
  );
  process.exit(1);
}
