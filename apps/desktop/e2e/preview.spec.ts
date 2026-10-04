import { test, expect } from "@playwright/test";

const modifier = process.platform === "darwin" ? "Meta" : "Control";

test("writing renders in place, clicking edits a block and leaving renders it again", async ({
  page,
}) => {
  await page.goto("/?preview=1");
  const editor = page.getByRole("textbox", { name: "文档编辑器" });
  await expect(
    page.getByRole("button", { name: "撰写", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "预览", exact: true }),
  ).toHaveCount(0);
  await editor.fill("# 标题\n\n正文 **加粗**\n\n末尾");
  await editor.press(`${modifier}+End`);
  await expect(editor.getByRole("heading", { name: "标题" })).toBeVisible();
  await expect(editor.locator("strong")).toHaveText("加粗");
  await editor.getByRole("heading", { name: "标题" }).click();
  await expect(editor.getByRole("heading")).toHaveCount(0);
  await editor.press("End");
  await editor.pressSequentially("修改");
  await editor.press(`${modifier}+End`);
  await expect(editor.getByRole("heading", { name: "标题修改" })).toBeVisible();
  await expect(editor).toBeEditable();
  await page.getByRole("button", { name: "源码", exact: true }).click();
  await expect(editor).toContainText("# 标题修改");
  await expect(editor).toContainText("**加粗**");
  await expect(editor.locator(".live-markdown-block")).toHaveCount(0);
});

test("mode changes retain caret and history and edits from source render immediately", async ({
  page,
}) => {
  await page.goto("/?preview=1");
  const editor = page.getByRole("textbox", { name: "文档编辑器" });
  await editor.fill("# 标题\n\n尾部");
  await editor.press(`${modifier}+End`);
  const position = await page.locator(".statusbar").innerText();
  await page.getByRole("button", { name: "源码", exact: true }).click();
  await expect(editor).toBeFocused();
  await expect(page.locator(".statusbar")).toHaveText(position, {
    useInnerText: true,
  });
  await editor.pressSequentially("继续");
  await page.getByRole("button", { name: "撰写", exact: true }).click();
  await expect(editor.getByRole("heading", { name: "标题" })).toBeVisible();
  await expect(editor).toContainText("尾部继续");
  await page.getByRole("button", { name: "文档操作" }).click();
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(editor).not.toContainText("继续");
  await page.getByRole("button", { name: "源码", exact: true }).click();
  await editor.fill("# 新标题\n\n新内容\n\n");
  await editor.press(`${modifier}+End`);
  await page.getByRole("button", { name: "撰写", exact: true }).click();
  await expect(editor.getByRole("heading", { name: "新标题" })).toBeVisible();
});

test("rendered GFM fits narrow and dark windows", async ({ page }) => {
  await page.goto("/?preview=1");
  const editor = page.getByRole("textbox", { name: "文档编辑器" });
  await editor.fill(
    "# 撰写验收\n\n正文 **加粗**\n\n| 项目 | 状态 |\n| --- | --- |\n| 即时渲染 | 可用 |\n\n```text\n" +
      "x".repeat(300) +
      "\n```\n\n末尾",
  );
  await editor.press(`${modifier}+End`);
  await expect(editor.getByRole("table")).toBeVisible();
  await page.setViewportSize({ width: 600, height: 720 });
  expect(
    await page
      .locator(".cm-scroller")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(editor.locator(".live-markdown-block").first()).toHaveCSS(
    "color",
    "rgb(204, 204, 204)",
  );
});
