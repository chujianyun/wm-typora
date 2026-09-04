import { createBrowserNativeBridge, createMemoryNativeBridge } from "./browserBridge";

describe("memory NativeBridge", () => {
  it("reads and atomically replaces a seeded UTF-8 document", async () => {
    const bridge = createMemoryNativeBridge({
      files: { "/notes/hello.md": "你好" },
      now: () => 42,
    });

    await expect(bridge.readFile("/notes/hello.md")).resolves.toMatchObject({
      path: "/notes/hello.md",
      name: "hello.md",
      markdown: "你好",
    });

    await bridge.writeFileAtomic("/notes/hello.md", "更新");
    await expect(bridge.readFile("/notes/hello.md")).resolves.toMatchObject({
      markdown: "更新",
      modifiedAt: 42,
    });
  });

  it("filters hidden, dependency, build and unsupported files", async () => {
    const bridge = createMemoryNativeBridge({
      files: {
        "/notes/guide.md": "guide",
        "/notes/draft.txt": "draft",
        "/notes/image.png": "binary",
        "/notes/.secret.md": "secret",
        "/notes/node_modules/package/readme.md": "dependency",
        "/notes/dist/output.md": "build",
        "/notes/topics/deep.markdown": "deep",
      },
    });

    await expect(bridge.scanWorkspace("/notes")).resolves.toEqual([
      {
        name: "draft.txt",
        path: "/notes/draft.txt",
        kind: "file",
      },
      {
        name: "guide.md",
        path: "/notes/guide.md",
        kind: "file",
      },
      {
        name: "topics",
        path: "/notes/topics",
        kind: "directory",
        children: [
          {
            name: "deep.markdown",
            path: "/notes/topics/deep.markdown",
            kind: "file",
          },
        ],
      },
    ]);
  });
});

describe("browser NativeBridge", () => {
  it("opens a selected browser folder and makes its Markdown files readable", async () => {
    const guide = new File(["# Guide"], "guide.md", { type: "text/markdown" });
    const image = new File(["binary"], "image.png", { type: "image/png" });
    Object.defineProperty(guide, "webkitRelativePath", { value: "notes/guide.md" });
    Object.defineProperty(image, "webkitRelativePath", { value: "notes/image.png" });
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
      Object.defineProperty(this, "files", { value: [guide, image], configurable: true });
      this.dispatchEvent(new Event("change"));
    });
    const bridge = createBrowserNativeBridge();

    await expect(bridge.openWorkspace()).resolves.toEqual({
      path: "notes",
      entries: [{ name: "guide.md", path: "notes/guide.md", kind: "file" }],
    });
    await expect(bridge.readFile("notes/guide.md")).resolves.toMatchObject({
      name: "guide.md",
      markdown: "# Guide",
    });

    click.mockRestore();
  });

  it("downloads changes when saving a browser-selected document", async () => {
    const note = new File(["first"], "note.md", { type: "text/markdown", lastModified: 7 });
    const inputClick = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
      Object.defineProperty(this, "files", { value: [note], configurable: true });
      this.dispatchEvent(new Event("change"));
    });
    const linkClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const createObjectURL = vi.fn(() => "blob:wtypora-test");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, configurable: true });
    const bridge = createBrowserNativeBridge();
    const opened = await bridge.openFile();

    await expect(
      bridge.writeFileAtomic("note.md", "updated", opened?.digest),
    ).resolves.toMatchObject({ path: "note.md", digest: expect.any(String) });
    expect(linkClick).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:wtypora-test");

    inputClick.mockRestore();
    linkClick.mockRestore();
  });
});
