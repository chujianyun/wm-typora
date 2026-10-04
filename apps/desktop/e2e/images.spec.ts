import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const modifier = process.platform === "darwin" ? "Meta" : "Control";
const imageUrl = "https://images.example.test/writing.svg";
const source = `# 图片撰写验证\n\n![](${imageUrl})\n\n继续写作`;
const fixture = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="600" viewBox="0 0 1600 600"><rect width="1600" height="600" fill="#e9f1f7"/><rect x="100" y="100" width="400" height="400" rx="30" fill="#609ac0"/><rect x="570" y="100" width="930" height="170" rx="30" fill="#9ac5dc"/><rect x="570" y="330" width="930" height="170" rx="30" fill="#c5dde9"/></svg>`;

test("remote images load under the production image policy and fit the writing surface", async ({
  page,
}, info) => {
  const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
  // Exercise the shipped image policy in a real browser without constraining Vite scripts.
  const imagePolicy = config.app.security.csp
    .split(";")
    .find((part: string) => part.trim().startsWith("img-src"));
  await page.route("**/?preview=1", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        "content-security-policy": imagePolicy,
      },
    });
  });
  await page.route(imageUrl, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: fixture }),
  );
  await page.setViewportSize({ width: 1000, height: 760 });
  await page.goto("/?preview=1");
  const editor = page.getByRole("textbox", { name: "文档编辑器" });
  await editor.fill(source);
  await editor.press(`${modifier}+End`);
  if (process.env.WTYPORA_BEFORE && info.project.name === "chromium")
    await page.screenshot({
      path: "../../docs/engineering/evidence/image-preview/before.png",
    });
  const image = editor.locator("img");
  await expect(image).toHaveCount(1);
  await expect
    .poll(() =>
      image.evaluate(
        (el: HTMLImageElement) => el.complete && el.naturalWidth === 1600,
      ),
    )
    .toBe(true);
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("alt", "");
  await expect
    .poll(async () => {
      const img = await image.boundingBox();
      const cursor = await page.locator(".cm-cursor").first().boundingBox();
      return !!img && !!cursor && cursor.y > img.y + img.height;
    })
    .toBe(true);
  if (info.project.name === "chromium")
    await page.screenshot({
      path: "../../docs/engineering/evidence/image-preview/after.png",
    });
  await page.setViewportSize({ width: 580, height: 720 });
  await expect
    .poll(() =>
      page
        .locator(".cm-scroller")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    )
    .toBe(true);
  await image.click();
  await expect(editor).toContainText(`![](${imageUrl})`);
  await editor.press(`${modifier}+End`);
  await expect(editor.locator("img")).toBeVisible();
});

test("failed remote images show a useful message and retain their Markdown", async ({
  page,
}) => {
  await page.route(imageUrl, (route) =>
    route.fulfill({ status: 404, body: "not found" }),
  );
  await page.goto("/?preview=1");
  const editor = page.getByRole("textbox", { name: "文档编辑器" });
  await editor.fill(source);
  await editor.press(`${modifier}+End`);
  await expect(
    editor.getByText("图片加载失败，请检查链接或网络。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "源码", exact: true }).click();
  await expect(editor).toContainText(`![](${imageUrl})`);
});

test("image insertion format persists and offers empty or filename descriptions", async ({
  page,
}, info) => {
  await page.goto("/?preview=1");
  const openSettings = async () => {
    await page.getByRole("button", { name: "文档操作" }).click();
    await page.getByRole("button", { name: "设置…" }).click();
  };
  await openSettings();
  await page.getByLabel("图床软件").selectOption("picgo-core");
  const format = page.getByLabel("图片插入格式");
  await expect(format).toHaveValue("filename");
  await format.selectOption("empty");
  await expect(page.getByText("![](图片链接)", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "完成" }).scrollIntoViewIfNeeded();
  if (info.project.name === "chromium")
    await page.screenshot({
      path: "../../docs/engineering/evidence/image-preview/settings.png",
    });
  await page.getByRole("button", { name: "完成" }).click();
  await page.reload();
  await openSettings();
  await expect(format).toHaveValue("empty");
  await format.selectOption("filename");
  await expect(
    page.getByText("![文件名](图片链接)", { exact: true }),
  ).toBeVisible();
});
