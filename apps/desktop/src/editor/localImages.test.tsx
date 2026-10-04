import { afterEach, expect, it, vi } from "vitest";
import { DocumentController } from "../document/controller";
import { FakeBridge } from "../native/fakeBridge";

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

async function liveController(text: string, path: string | null) {
  const bridge = new FakeBridge();
  bridge.opened.text = text;
  bridge.opened.path = path;
  const controller = new DocumentController(document.createElement("div"), bridge);
  cleanups.push(() => controller.dispose());
  await controller.initialize();
  controller.setMode("live");
  return { bridge, controller };
}

it("loads a relative image next to the saved document as a data URL", async () => {
  const { bridge, controller } = await liveController(
    "前文\n\n![截图](pic.png)\n\n后文",
    "/docs/note.md",
  );
  bridge.localImages.set("pic.png", {
    bytes: [137, 80, 78, 71],
    mime: "image/png",
  });
  const read = vi.spyOn(bridge, "readLocalImage");
  controller.setMode("source");
  controller.setMode("live");
  const img = controller.view.dom.querySelector<HTMLImageElement>(
    "img[data-local-src]",
  );
  expect(img).not.toBeNull();
  expect(img).not.toHaveAttribute("src");
  await vi.waitFor(() =>
    expect(img!.getAttribute("src")).toMatch(/^data:image\/png;base64,/),
  );
  expect(read).toHaveBeenCalledWith("pic.png", "/docs/note.md");
  expect(img).toHaveAttribute("alt", "截图");
});

it("shows the error hint when the local image cannot be read", async () => {
  const { controller } = await liveController(
    "前文\n\n![丢失](missing.png)",
    "/docs/note.md",
  );
  const img = controller.view.dom.querySelector<HTMLImageElement>(
    "img[data-local-src]",
  )!;
  expect(img).not.toBeNull();
  await vi.waitFor(() => {
    const error = img.parentElement!.querySelector<HTMLElement>(
      ".preview-image-error",
    )!;
    expect(error.hidden).toBe(false);
  });
  expect(img.hidden).toBe(true);
});

it("keeps rendering remote images without touching the local loader", async () => {
  const { bridge, controller } = await liveController(
    "前文\n\n![远程](https://example.com/pic.png)",
    "/docs/note.md",
  );
  const read = vi.spyOn(bridge, "readLocalImage");
  const img = controller.view.dom.querySelector<HTMLImageElement>(
    ".preview-image img",
  )!;
  expect(img).toHaveAttribute("src", "https://example.com/pic.png");
  expect(img).not.toHaveAttribute("data-local-src");
  expect(read).not.toHaveBeenCalled();
});
