import { test, expect } from "@playwright/test";

const modifier = process.platform === "darwin" ? "Meta" : "Control";
const imageUrl = "https://images.example.test/line.svg";
const source = `# 图片无需空行\n上方正文\n![](${imageUrl})\n下方继续写作`;

test("standalone image previews while editing adjacent text without blank lines", async ({
  page,
}, info) => {
  await page.route(imageUrl, (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="220"><rect width="800" height="220" fill="#9ac5dc"/><circle cx="400" cy="110" r="75" fill="#609ac0"/></svg>',
    }),
  );
  await page.setViewportSize({ width: 1000, height: 760 });
  await page.goto("/?preview=1");
  const editor = page.getByRole("textbox", { name: "文档编辑器" });
  await editor.fill(source);
  await editor.press(`${modifier}+End`);
  if (process.env.WTYPORA_BEFORE) {
    await page.screenshot({
      path: `../../docs/engineering/evidence/image-no-blank-line/before-${info.project.name}.png`,
    });
  }
  const image = editor.locator("img");
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate(
        (el: HTMLImageElement) => el.complete && el.naturalWidth === 800,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: `../../docs/engineering/evidence/image-no-blank-line/after-${info.project.name}.png`,
  });
  await image.click();
  await expect(editor).toContainText(`![](${imageUrl})`);
  await expect(image).toHaveCount(0);
  await editor.press("ArrowLeft");
  await expect(image).toBeVisible();
  await image.click();
  await expect(editor).toContainText(`![](${imageUrl})`);
  await editor.press(`${modifier}+End`);
  await expect(image).toBeVisible();
  await page.getByRole("button", { name: "源码", exact: true }).click();
  await expect(editor.locator(".cm-line")).toHaveText(source.split("\n"));
});
