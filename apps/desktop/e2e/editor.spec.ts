import { test, expect } from "@playwright/test";
test("writing column stays centered with desktop and narrow-window padding", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/?preview=1");
  const content = page.getByRole("textbox", { name: "文档编辑器" });
  await expect(content).toBeEditable();
  const box = await content.boundingBox();
  expect(box!.width).toBe(760);
  expect(box!.x).toBe(260);
  await expect(content).toHaveCSS("padding-top", "60px");
  await expect(content).toHaveCSS("padding-left", "32px");
  await expect(content).toHaveCSS("line-height", "28.5px");
  await page.setViewportSize({ width: 600, height: 720 });
  await expect(content).toHaveCSS("padding-top", "35px");
  await expect(content).toHaveCSS("padding-left", "25px");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveCSS(
    "background-color",
    "rgb(37, 37, 37)",
  );
});
test("edit, save, edit again, and cancel close", async ({ page }, info) => {
  await page.goto("/?preview=1");
  const editor = page.getByRole("textbox", { name: "文档编辑器" });
  await editor.fill("# 我的文档\n\n中文正文 **Markdown**");
  await page.getByRole("button", { name: "文档操作" }).click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".save-status")).toHaveText("已保存");
  await editor.press("End");
  await editor.pressSequentially(" more");
  await page.getByRole("button", { name: "文档操作" }).click();
  await page.getByRole("button", { name: "关闭文档", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(editor).toContainText("more");
  await expect(page.getByRole("complementary")).toHaveCount(0);
  if (info.project.name === "chromium")
    await page.screenshot({
      path: "../../docs/engineering/evidence/source-preview.png",
      fullPage: true,
    });
});
test("source syntax, undo and find remain usable", async ({ page }) => {
  await page.goto("/?preview=1");
  const editor = page.getByRole("textbox", { name: "文档编辑器" });
  await editor.fill("# 标题\n\n```unknown\n原文\n```");
  await editor.press("End");
  await editor.pressSequentially(" text");
  await page.getByRole("button", { name: "文档操作" }).click();
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(editor).toContainText("原文");
  await editor.click();
  await editor.press(process.platform === "darwin" ? "Meta+f" : "Control+f");
  await expect(page.locator(".cm-search")).toBeVisible();
});
