import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";

test("record browser development-mode baseline (opt-in)", async ({
  page,
  browser,
}, info) => {
  test.skip(
    process.env.WTYPORA_PERF !== "1" || info.project.name !== "chromium",
    "Run explicitly with WTYPORA_PERF=1",
  );
  test.setTimeout(90000);
  const starts: number[] = [];
  // Fresh browser context, not OS cold start; first 5 and following 20 reported separately.
  for (let i = 0; i < 25; i++) {
    const context = await browser.newContext(),
      p = await context.newPage();
    const start = performance.now();
    await p.goto("http://127.0.0.1:1420/?preview=1");
    await expect(p.getByRole("textbox", { name: "文档编辑器" })).toBeEditable();
    starts.push(performance.now() - start);
    await context.close();
  }
  await page.goto("/?preview=1");
  await expect(
    page.getByRole("textbox", { name: "文档编辑器" }),
  ).toBeEditable();
  const oneMiB = "# Large\n" + "abcdefghijklmno\n".repeat(65535) + "tail1234";
  expect(Buffer.byteLength(oneMiB)).toBe(1048576);
  const hundredK = "line of source\n".repeat(99999) + "last";
  const edits = await page.evaluate(
    async ({ oneMiB, hundredK }) => {
      const bufferPath = "/src/editor/buffer.ts";
      const controllerPath = "/src/document/controller.ts";
      const fakePath = "/src/native/fakeBridge.ts";
      const { createBuffer } = await import(/* @vite-ignore */ bufferPath);
      const { DocumentController } = await import(
        /* @vite-ignore */ controllerPath
      );
      const { FakeBridge } = await import(/* @vite-ignore */ fakePath);
      const host = document.createElement("div");
      document.body.append(host);
      const controller = new DocumentController(host, new FakeBridge());
      await controller.initialize();
      const sizes: Record<string, number> = {};
      for (const [name, text] of Object.entries({ oneMiB, hundredK })) {
        const start = performance.now();
        controller.view.setState(
          createBuffer(text, { encoding: "utf-8", eol: "lf" }),
        );
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        sizes[name] = performance.now() - start;
      }
      const sync = [];
      for (let i = 0; i < 1000; i++) {
        const start = performance.now();
        controller.view.dispatch({
          changes: { from: controller.view.state.doc.length, insert: "x" },
        });
        sync.push(performance.now() - start);
      }
      controller.dispose();
      host.remove();
      return { sizes, sync };
    },
    { oneMiB, hundredK },
  );
  const editor = page.getByRole("textbox", { name: "文档编辑器" });
  await editor.click();
  await page.evaluate(() => {
    const timings: number[] = [];
    (window as unknown as { inputTimings: number[] }).inputTimings = timings;
    document
      .querySelector(".cm-content")!
      .addEventListener("beforeinput", () => {
        const start = performance.now();
        requestAnimationFrame(() => timings.push(performance.now() - start));
      });
  });
  for (let i = 0; i < 1000; i++) await page.keyboard.press("x");
  await expect(editor).toContainText("x".repeat(1000));
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const input = await page.evaluate(
    () => (window as unknown as { inputTimings: number[] }).inputTimings,
  );
  const summary = (a: number[]) => {
    const sorted = [...a].sort((a, b) => a - b);
    return {
      n: a.length,
      median: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[
        Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))
      ],
      p99: sorted[
        Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))
      ],
    };
  };
  const report = {
    date: new Date().toISOString(),
    environment: {
      cpu: os.cpus()[0].model,
      ram: os.totalmem(),
      os: os.release(),
      browser: browser.version(),
      mode: "Vite development / browser preview, NOT native WKWebView or release",
    },
    units: "ms",
    hashes: {
      oneMiB: createHash("sha256").update(oneMiB).digest("hex"),
      hundredK: createHash("sha256").update(hundredK).digest("hex"),
    },
    summary: {
      firstFiveContextStart: summary(starts.slice(0, 5)),
      followingTwentyContextStart: summary(starts.slice(5)),
      bufferOpenTwoFrames: edits.sizes,
      synchronous100kLineDispatch: summary(edits.sync),
      beforeinputToNextFrame: summary(input),
    },
    raw: { starts, dispatch: edits.sync, input },
  };
  mkdirSync("../../docs/engineering/evidence", { recursive: true });
  writeFileSync(
    "../../docs/engineering/evidence/browser-performance.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report.summary));
});
