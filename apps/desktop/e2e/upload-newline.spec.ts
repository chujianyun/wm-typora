import { test, expect } from "@playwright/test";

const url = "https://images.example.test/upload.svg";

test("successful image paste places the caret on the next line for continued writing", async ({
  page,
}, info) => {
  await page.route(url, (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="160"><rect width="640" height="160" fill="#9ac5dc"/></svg>',
    }),
  );
  await page.goto("/?preview=1");
  await page.evaluate(async (imageUrl) => {
    localStorage.setItem(
      "wtypora.preferences.v1",
      JSON.stringify({ upload: { provider: "picgo", imageAlt: "empty" } }),
    );
    // Replace only the browser demo bridge; exercise the actual clipboard/controller flow.
    const modulePath = "/src/native/fakeBridge.ts";
    const { FakeBridge } = await import(/* @vite-ignore */ modulePath);
    FakeBridge.prototype.uploadImage = async () => imageUrl;
  }, url);
  const editor = page.getByRole("textbox", { name: "文档编辑器" });
  await editor.click();
  await editor.evaluate((el) => {
    const clipboardData = new DataTransfer();
    clipboardData.items.add(
      new File([new Uint8Array([1, 2, 3])], "sample.png", {
        type: "image/png",
      }),
    );
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(page.getByText("正在上传图片…", { exact: true })).toHaveCount(0);
  if (process.env.WTYPORA_BEFORE) {
    await expect(editor).toContainText(`![](${url})`);
    await page.screenshot({
      path: `../../docs/engineering/evidence/upload-newline/before-${info.project.name}.png`,
    });
  }
  await expect(editor.locator("img")).toBeVisible();
  await page.keyboard.type("继续写作");
  await expect(editor).toContainText("继续写作");
  await expect(editor.locator("img")).toBeVisible();
  await page.screenshot({
    path: `../../docs/engineering/evidence/upload-newline/after-${info.project.name}.png`,
  });
  await page.getByRole("button", { name: "源码", exact: true }).click();
  await expect(editor.locator(".cm-line")).toHaveText([
    `![](${url})`,
    "继续写作",
  ]);
});
