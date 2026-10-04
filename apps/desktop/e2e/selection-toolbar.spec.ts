import { test, expect } from "@playwright/test";
const modifier = process.platform === "darwin" ? "Meta" : "Control";
test("selection menu formats headings, emphasis, links and images, with undo and dismissal", async ({
  page,
}) => {
  await page.goto("/?preview=1");
  const editor = page.getByRole("textbox", { name: "文档编辑器" });
  await page.getByRole("button", { name: "源码", exact: true }).click();
  await editor.fill("hello");
  await editor.press(`${modifier}+a`);
  const toolbar = page.getByRole("toolbar", { name: "文本格式" });
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole("button", { name: "加粗", exact: true }).click();
  await expect(editor).toHaveText("**hello**");
  await toolbar.getByRole("button", { name: "加粗", exact: true }).click();
  await expect(editor).toHaveText("hello");
  await toolbar.getByRole("button", { name: "斜体", exact: true }).click();
  await expect(editor).toHaveText("*hello*");
  await editor.press(`${modifier}+z`);
  await expect(editor).toHaveText("hello");
  await editor.press(`${modifier}+a`);
  await toolbar.getByLabel("标题级别").selectOption("2");
  await expect(editor).toHaveText("## hello");
  await toolbar.getByLabel("标题级别").selectOption("0");
  await expect(editor).toHaveText("hello");
  await toolbar.getByRole("button", { name: "超链接", exact: true }).click();
  await toolbar.getByLabel("链接地址").fill("javascript:alert(1)");
  await toolbar.getByRole("button", { name: "插入", exact: true }).click();
  await expect(toolbar.getByRole("alert")).toContainText("请输入");
  await toolbar.getByLabel("链接地址").fill("https://example.com");
  await toolbar.getByRole("button", { name: "插入", exact: true }).click();
  await expect(editor).toHaveText("[hello](https://example.com/)");
  await editor.press(`${modifier}+z`);
  await editor.press(`${modifier}+a`);
  await toolbar.getByRole("button", { name: "插入图片", exact: true }).click();
  await toolbar.getByLabel("图片地址").fill("https://example.com/a.png");
  await toolbar.getByRole("button", { name: "插入", exact: true }).click();
  await expect(editor).toHaveText("![hello](https://example.com/a.png)");
  await editor.press(`${modifier}+a`);
  await editor.press("Escape");
  await expect(toolbar).toBeHidden();
  await editor.press("ArrowRight");
  await expect(toolbar).toBeHidden();
});
test("live mode mouse selection and narrow night layout", async ({ page }) => {
  await page.goto("/?preview=1");
  await page.setViewportSize({ width: 500, height: 720 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "night";
  });
  const editor = page.getByRole("textbox", { name: "文档编辑器" });
  await editor.fill("hello selection");
  await editor.dblclick();
  const toolbar = page.getByRole("toolbar", { name: "文本格式" });
  await expect(toolbar).toBeVisible();
  const rect = await toolbar.boundingBox();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(500);
  await toolbar.getByRole("button", { name: "加粗", exact: true }).click();
  await expect(editor).toContainText("**");
  await page.getByRole("button", { name: "源码", exact: true }).click();
  await expect(toolbar).toBeHidden();
});
test("local image picker preserves the selected insertion point", async ({
  page,
}) => {
  await page.goto("/?preview=1");
  await page.evaluate(async () => {
    localStorage.setItem(
      "wtypora.preferences.v1",
      JSON.stringify({ upload: { provider: "picgo", imageAlt: "empty" } }),
    );
    const modulePath = "/src/native/fakeBridge.ts";
    const { FakeBridge } = await import(/* @vite-ignore */ modulePath);
    FakeBridge.prototype.uploadImage = async () =>
      "https://example.com/test.png";
  });
  await page.getByRole("button", { name: "源码", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "文档编辑器" });
  await editor.fill("replace me");
  await editor.press(`${modifier}+a`);
  const toolbar = page.getByRole("toolbar", { name: "文本格式" });
  await toolbar.getByRole("button", { name: "插入图片", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await toolbar.getByRole("button", { name: "选择本地图片" }).click();
  await (
    await chooser
  ).setFiles({
    name: "test.png",
    mimeType: "image/png",
    buffer: Buffer.from([1, 2, 3]),
  });
  await expect(editor).toHaveText("![](https://example.com/test.png)");
  await editor.press(`${modifier}+z`);
  await expect(editor).toHaveText("replace me");
});
