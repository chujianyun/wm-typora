import { test, expect, type Locator } from "@playwright/test";

const samples = {
  paragraphs: "选一个功能\n\n分清边界。",
  list: "刚开始不用做得这么复杂。选一个常用功能，先留下三条任务：\n\n1. 一条平时能顺利完成的，检查修改后还能不能做好。\n2. 一条曾经失败的，检查老问题有没有解决。\n3. 一条容易误解的，检查它能不能分清边界。",
  single: "选一个功能，分清边界。",
};

async function points(editor: Locator) {
  return editor.evaluate((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    const first = nodes.find((n) => n.textContent?.includes("选一个"))!;
    const last = nodes.find((n) => n.textContent?.includes("分清边界。"))!;
    function point(node: Text, offset: number) {
      const range = document.createRange();
      range.setStart(node, offset);
      range.setEnd(node, offset);
      const rect = range.getBoundingClientRect();
      return { x: rect.x, y: rect.y + rect.height / 2 };
    }
    return [
      point(first, first.textContent!.indexOf("选一个")),
      point(last, last.length),
    ];
  });
}

async function selectedText(editor: Locator) {
  return editor.evaluate(async (el) => {
    const modulePath = "/node_modules/.vite/deps/@codemirror_view.js";
    const { EditorView } = await import(/* @vite-ignore */ modulePath);
    const view = EditorView.findFromDOM(el);
    const { from, to } = view.state.selection.main;
    return view.state.sliceDoc(from, to);
  });
}

for (const [name, sample] of Object.entries(samples)) {
  for (const active of ["start", "end"] as const) {
    for (const direction of ["forward", "backward"] as const) {
      test(`${name}: drag ${direction} with ${active} active`, async ({
        page,
      }, info) => {
        await page.goto("/?preview=1");
        const editor = page.getByRole("textbox", { name: "文档编辑器" });
        await editor.fill(sample);
        const modifier = process.platform === "darwin" ? "Meta" : "Control";
        await editor.press(
          `${modifier}+${active === "start" ? "Home" : "End"}`,
        );
        const endpoints = await points(editor);
        const [start, end] =
          direction === "forward" ? endpoints : [...endpoints].reverse();
        await page.mouse.move(start.x + 1, start.y);
        await page.mouse.down();
        await page.mouse.move(end.x, end.y, { steps: 30 });
        await page.mouse.up();
        if (
          process.env.WTYPORA_DRAG_EVIDENCE &&
          name === "list" &&
          active === "end"
        ) {
          await page.screenshot({
            path: `${process.env.WTYPORA_DRAG_EVIDENCE}/${info.project.name}-${direction}.png`,
          });
        }
        expect(await selectedText(editor)).toBe(
          sample.slice(sample.indexOf("选一个")),
        );
        await expect(
          page.getByRole("toolbar", { name: "文本格式" }),
        ).toBeVisible();
        // Selection must not modify Markdown or its list markers.
        await page.getByRole("button", { name: "源码", exact: true }).click();
        await expect(editor.locator(".cm-line")).toHaveText(sample.split("\n"));
      });
    }
  }
}

test("shift-click extends the existing anchor into a rendered block", async ({
  page,
}) => {
  await page.goto("/?preview=1");
  const editor = page.getByRole("textbox", { name: "文档编辑器" });
  await editor.fill(samples.paragraphs);
  await editor.press(
    `${process.platform === "darwin" ? "Meta" : "Control"}+End`,
  );
  const [start] = await points(editor);
  await page.keyboard.down("Shift");
  await page.mouse.click(start.x + 1, start.y);
  await page.keyboard.up("Shift");
  expect(await selectedText(editor)).toBe(samples.paragraphs);
});
