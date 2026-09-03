import { createMemoryNativeBridge } from "./browserBridge";

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
