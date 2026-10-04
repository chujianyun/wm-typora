import { test, expect } from "@playwright/test";

test("recent files show ten choices with full paths and support keyboard dismissal", async ({
  page,
}, info) => {
  await page.goto("/?preview=1");
  const editor = page.getByRole("textbox", { name: "文档编辑器" });
  await editor.fill("保留正在编辑的内容");
  const paths = Array.from(
    { length: 10 },
    (_, index) => `/示例文档/项目 ${index + 1}/会议记录与后续行动计划.md`,
  );
  await page.evaluate(async (paths) => {
    const modulePath = "/src/native/fakeBridge.ts";
    const { FakeBridge } = await import(modulePath);
    FakeBridge.prototype.recentFiles = async () => paths;
  }, paths);
  await page.getByRole("button", { name: "文档操作" }).click();
  await page.getByRole("button", { name: "最近打开…" }).click();
  const dialog = page.getByRole("dialog", { name: "最近打开" });
  await expect(dialog.getByRole("listitem")).toHaveCount(10);
  await expect(
    dialog.getByRole("button", { name: `打开 ${paths[0]}` }),
  ).toHaveAttribute("title", paths[0]);
  if (info.project.name === "chromium") {
    await page.screenshot({
      path: "../../docs/engineering/evidence/recent-files.png",
    });
  }
  await page.setViewportSize({ width: 580, height: 420 });
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await dialog.getByRole("button", { name: `打开 ${paths[9]}` }).click();
  await expect(dialog).not.toBeVisible();
  await expect(editor).toHaveText("保留正在编辑的内容");
  await page.getByRole("button", { name: "文档操作" }).click();
  await page.getByRole("button", { name: "最近打开…" }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
