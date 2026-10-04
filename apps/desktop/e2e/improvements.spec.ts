import { test, expect } from "@playwright/test";

test("Enter keeps separate visual lines after the paragraph is rendered", async ({
  page,
}, info) => {
  await page.goto("/?preview=1");
  const editor = page.getByRole("textbox", { name: "文档编辑器" });
  await editor.fill("# 记录\n\n第一条事项");
  await editor.press(
    process.platform === "darwin" ? "Meta+End" : "Control+End",
  );
  await editor.press("Enter");
  await editor.pressSequentially("第二条事项");
  await editor.press("Enter");
  await editor.pressSequentially("第三条事项");
  await editor.press("Enter");
  await editor.press("Enter");
  const paragraph = editor
    .locator(".live-markdown-block p")
    .filter({ hasText: "第一条事项" });
  await expect
    .poll(async () => {
      const block = await paragraph.boundingBox();
      const cursor = await page.locator(".cm-cursor").first().boundingBox();
      return cursor!.y >= block!.y + block!.height;
    })
    .toBe(true);
  if (info.project.name === "chromium")
    await page.screenshot({
      path: `../../docs/engineering/evidence/writing-improvements/${process.env.WTYPORA_BEFORE ? "before" : "after"}-enter.png`,
    });
  const lines = await paragraph.innerText();
  expect(lines).toBe("第一条事项\n第二条事项\n第三条事项");
  await editor.pressSequentially("新段落");
  await expect(page.locator(".statusbar")).toContainText("Ln 7, Col 4");
});

test("themes and uploader preferences persist without changing Markdown", async ({
  page,
}, info) => {
  await page.goto("/?preview=1");
  const editor = page.getByRole("textbox", { name: "文档编辑器" });
  await editor.fill("# 主题示例\n\n这是 **写作** 的地方。\n\n");
  await page.getByRole("button", { name: "文档操作" }).click();
  await page.getByRole("button", { name: "设置…" }).click();
  await page.getByRole("radio", { name: /Newsprint/ }).check();
  await expect(page.locator("html")).toHaveCSS(
    "background-color",
    "rgb(243, 242, 238)",
  );
  await page.getByLabel("图床软件").selectOption("picgo");
  await expect(page.getByLabel("PicGo 服务地址")).toHaveValue(
    "http://127.0.0.1:36677/upload",
  );
  if (info.project.name === "chromium")
    await page.screenshot({
      path: "../../docs/engineering/evidence/writing-improvements/settings.png",
    });
  await page.getByRole("button", { name: "完成" }).click();
  await expect(editor).toContainText("写作");
  await page.reload();
  await expect(page.locator("html")).toHaveCSS(
    "background-color",
    "rgb(243, 242, 238)",
  );
  await page.getByRole("button", { name: "文档操作" }).click();
  await page.getByRole("button", { name: "设置…" }).click();
  await expect(page.getByLabel("图床软件")).toHaveValue("picgo");
  await page.getByRole("radio", { name: /Night/ }).check();
  await expect(page.locator("html")).toHaveCSS(
    "background-color",
    "rgb(37, 42, 52)",
  );
  await page.setViewportSize({ width: 600, height: 720 });
  const dialog = page.getByRole("dialog");
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.getByRole("button", { name: "完成" }).click();
});

test("image clipboard events reach the uploader and report failure without inserting broken Markdown", async ({
  page,
}) => {
  await page.goto("/?preview=1");
  await page.getByRole("button", { name: "文档操作" }).click();
  await page.getByRole("button", { name: "设置…" }).click();
  await page.getByLabel("图床软件").selectOption("picgo");
  await page.getByRole("button", { name: "完成" }).click();
  const editor = page.getByRole("textbox", { name: "文档编辑器" });
  await editor.fill("保留正文");
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
  await expect(page.getByRole("alert")).toContainText("浏览器演示不连接图床");
  await expect(editor).toHaveText("保留正文");
});
