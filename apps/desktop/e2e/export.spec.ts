import { test, expect } from "@playwright/test";
import JSZip from "jszip";

test("exports editable Word with an embedded image and preserves unsaved source", async ({
  page,
}) => {
  await page.goto("/?preview=1");
  await page.evaluate(async () => {
    const modulePath = "/src/native/fakeBridge.ts";
    const { FakeBridge } = await import(modulePath);
    FakeBridge.prototype.exportImage = async () => ({
      mime: "image/png",
      bytes: Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        ),
        (c) => c.charCodeAt(0),
      ),
    });
    FakeBridge.prototype.exportDocument = async (request: unknown) => {
      document.documentElement.dataset.exportResult = JSON.stringify(request);
      return "/exports/无标题.docx";
    };
  });
  const text =
    "# 中文标题\n\n未保存 **加粗**\n\n![示例](https://example.com/image.png)\n\n| 内容 | 状态 |\n| --- | --- |\n| Word | 已验证 |\n\n" +
    "正文\n\n".repeat(150) +
    "文末标记";
  await page.getByRole("button", { name: "源码", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "文档编辑器" });
  await editor.fill(text);
  await page.getByRole("button", { name: "文档操作", exact: true }).click();
  await page.getByRole("button", { name: "导出 Word（.docx）…" }).click();
  await expect(page.getByText("已导出：无标题.docx")).toBeVisible();
  const request = await page.evaluate(() =>
    JSON.parse(document.documentElement.dataset.exportResult!),
  );
  const zip = await JSZip.loadAsync(Uint8Array.from(request.bytes));
  const xml = await zip.file("word/document.xml")!.async("string");
  expect(xml).toContain("文末标记");
  expect(xml).toContain("<w:tbl>");
  expect(xml).toContain("<w:drawing>");
  await expect(page.locator(".save-status")).toHaveText("草稿未保存");
  await expect(page.locator("#wtypora-export")).toHaveCount(0);
  await expect(page.getByText("已导出：无标题.docx")).toHaveCount(0, {
    timeout: 4500,
  });
});

test("prints complete white A4 content without app chrome and keeps the menu usable in a small window", async ({
  page,
}, info) => {
  await page.goto("/?preview=1");
  await page.evaluate(async () => {
    const modulePath = "/src/native/fakeBridge.ts";
    const { FakeBridge } = await import(modulePath);
    FakeBridge.prototype.exportDocument = async () => {
      document.documentElement.dataset.printReady = "true";
      await new Promise<void>((resolve) =>
        document.addEventListener("finish-export", () => resolve(), {
          once: true,
        }),
      );
      return "/exports/无标题.pdf";
    };
  });
  await page.getByRole("button", { name: "源码", exact: true }).click();
  await page
    .getByRole("textbox", { name: "文档编辑器" })
    .fill(
      "# PDF 中文导出\n\n" +
        "这是跨页验证段落，包含 **加粗** 和中文文本。\n\n".repeat(100) +
        "文末完整标记",
    );
  await page.setViewportSize({ width: 580, height: 420 });
  await page.getByRole("button", { name: "文档操作", exact: true }).click();
  const menu = page.getByLabel("文档操作菜单");
  expect(
    await menu.evaluate((el) => el.getBoundingClientRect().bottom),
  ).toBeLessThan(420);
  await page.getByRole("button", { name: "导出 PDF…" }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-print-ready",
    "true",
  );
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".app")).not.toBeVisible();
  await expect(page.locator("#wtypora-export")).toBeVisible();
  await expect(page.locator("#wtypora-export")).toContainText("文末完整标记");
  expect(
    await page
      .locator("#wtypora-export")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(255, 255, 255)");
  if (info.project.name === "chromium")
    await page.pdf({
      path: "../../docs/engineering/evidence/export/browser-pagination.pdf",
      format: "A4",
      margin: { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" },
    });
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => document.dispatchEvent(new Event("finish-export")));
  await expect(page.getByText("已导出：无标题.pdf")).toBeVisible();
  await expect(page.locator(".app")).toBeVisible();
  await expect(page.getByText("已导出：无标题.pdf")).toHaveCount(0, {
    timeout: 4500,
  });
});
