import { test, expect } from "@playwright/test";

const modifier = process.platform === "darwin" ? "Meta" : "Control";

test("typed fences support highlighted editing, indentation and rendering", async ({
  page,
}) => {
  await page.goto("/?preview=1");
  const editor = page.getByRole("textbox", { name: "文档编辑器" });
  await editor.fill("```js");
  await editor.press("End");
  await editor.press("Enter");
  await expect(editor.locator(".cm-code-line")).toHaveCount(3);
  await editor.pressSequentially('const message = "hello";');
  await expect(editor.locator(".tok-keyword")).toHaveText("const");
  await editor.press("Home");
  await editor.press("Tab");
  await expect(editor.locator(".cm-code-line").nth(1)).toContainText(
    "  const message",
  );
  await editor.press(`${modifier}+End`);
  await editor.press("Enter");
  await editor.press("Enter");
  await editor.pressSequentially("末尾");
  await expect(editor.locator(".code-block-language")).toHaveText("js");
  await expect(editor.locator("pre code")).toHaveText(
    '  const message = "hello";\n',
  );
  await editor.locator("pre code").click();
  await expect(editor.locator(".cm-code-line")).toHaveCount(3);
  await expect(editor.locator("pre")).toHaveCount(0);
  await page.getByRole("button", { name: "源码", exact: true }).click();
  await expect(editor).toContainText("```js");
  await expect(editor.locator(".tok-keyword")).toHaveText("const");
});

test("menu and shortcut insert undoable code blocks around selected text", async ({
  page,
}) => {
  await page.goto("/?preview=1");
  const editor = page.getByRole("textbox", { name: "文档编辑器" });
  await page.getByRole("button", { name: "文档操作" }).click();
  await page.getByRole("button", { name: "插入代码块", exact: true }).click();
  await expect(editor).toBeFocused();
  await editor.pressSequentially("print(42)");
  await expect(editor.locator(".cm-code-line").nth(1)).toHaveText("print(42)");
  await page.getByRole("button", { name: "源码", exact: true }).click();
  await editor.fill("hello");
  await editor.press(`${modifier}+a`);
  await editor.press(`${modifier}+Alt+c`);
  await expect(editor.locator(".cm-line").nth(1)).toHaveText("hello");
  await expect(editor.locator(".cm-line").first()).toHaveText("```");
  await editor.press(`${modifier}+z`);
  await expect(editor).toHaveText("hello");
});

test("long code stays within a narrow window and uses readable night colors", async ({
  page,
}) => {
  await page.goto("/?preview=1");
  const editor = page.getByRole("textbox", { name: "文档编辑器" });
  await editor.fill('```python\nprint("' + "x".repeat(300) + '")\n```\n\n末尾');
  await editor.press(`${modifier}+End`);
  await page.setViewportSize({ width: 500, height: 720 });
  const code = editor.locator("pre");
  await expect(code).toBeVisible();
  expect(await code.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
    true,
  );
  expect(
    await page
      .locator(".cm-scroller")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "night";
  });
  await expect(code.locator(".tok-string")).toHaveCSS(
    "color",
    "rgb(165, 214, 154)",
  );
});
