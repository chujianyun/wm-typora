import { it, expect, afterEach, vi } from "vitest";
import { DocumentController } from "./controller";
import { FakeBridge } from "../native/fakeBridge";
const controllers: DocumentController[] = [];
afterEach(() => {
  controllers.forEach((c) => c.dispose());
  controllers.length = 0;
  vi.useRealTimers();
  document.body.innerHTML = "";
});
async function setup() {
  const host = document.createElement("div");
  document.body.append(host);
  const bridge = new FakeBridge();
  const c = new DocumentController(host, bridge);
  controllers.push(c);
  await c.initialize();
  return { c, bridge };
}
it("cancel close preserves text and undo history", async () => {
  const { c, bridge } = await setup();
  c.view.dispatch({ changes: { from: 0, insert: "# 草稿" } });
  await c.close();
  expect(c.ui.modal?.kind).toBe("close");
  await c.cancelModal();
  expect(c.text()).toBe("# 草稿");
  expect(bridge.closed).toBe(false);
  c.undo();
  expect(c.text()).toBe("");
});
it("failed native file drop leaves current text and undo history intact", async () => {
  const { c } = await setup();
  c.view.dispatch({ changes: { from: 0, insert: "未保存正文" } });
  const sessionId = c.ui.session!.sessionId;
  c.reportOpenError("请选择 Markdown 文件");
  expect(c.ui.warning).toBe("请选择 Markdown 文件");
  expect(c.ui.session!.sessionId).toBe(sessionId);
  expect(c.text()).toBe("未保存正文");
  c.undo();
  expect(c.text()).toBe("");
});
it("cancelled Save As preserves untitled text and identity", async () => {
  const { c, bridge } = await setup();
  c.view.dispatch({ changes: { from: 0, insert: "中文" } });
  const id = c.ui.session!.sessionId;
  bridge.cancelSaveAs = true;
  await c.save();
  expect(c.ui.session!.path).toBeNull();
  expect(c.ui.session!.sessionId).toBe(id);
  expect(c.text()).toBe("中文");
});
it("save then edit persists latest version", async () => {
  const { c, bridge } = await setup();
  c.view.dispatch({ changes: { from: 0, insert: "one" } });
  await c.save();
  expect(bridge.disk).toBe("one");
  expect(c.ui.session!.phase).toBe("clean");
  c.view.dispatch({ changes: { from: 3, insert: " two" } });
  await c.save();
  expect(bridge.disk).toBe("one two");
  expect(c.ui.session!.phase).toBe("clean");
});
it("failed save keeps dirty text and prevents close", async () => {
  const { c, bridge } = await setup();
  c.view.dispatch({ changes: { from: 0, insert: "unsaved" } });
  bridge.failSave = true;
  await c.save();
  await c.close();
  expect(bridge.closed).toBe(false);
  expect(c.text()).toBe("unsaved");
  expect(c.ui.modal?.kind).toBe("close");
});
it("Save As resolves conflict and resumes autosave", async () => {
  const { c, bridge } = await setup();
  c.view.dispatch({ changes: { from: 0, insert: "local" } });
  await c.save();
  c.view.dispatch({ changes: { from: 5, insert: " edit" } });
  bridge.external = true;
  bridge.disk = "external";
  await c.checkDisk();
  await c.showConflict();
  expect(c.ui.session!.phase).toBe("conflict");
  await c.save(true);
  expect(c.ui.session!.phase).toBe("clean");
  expect(c.ui.modal).toBeNull();
  c.view.dispatch({ changes: { from: 10, insert: " again" } });
  await c.save();
  expect(bridge.disk).toBe("local edit again");
});
it("explicit discard closes even when recovery storage is unavailable", async () => {
  const { c, bridge } = await setup();
  c.view.dispatch({ changes: { from: 0, insert: "discard me" } });
  bridge.writeRecovery = async () => {
    throw new Error("recovery disk full");
  };
  await c.close();
  await c.discardAndClose();
  expect(bridge.closed).toBe(true);
});
it("discarding restored text also discards the original recovery record", async () => {
  const { c, bridge } = await setup();
  const snapshot = {
    sessionId: "crashed",
    epoch: 1,
    recoveryId: crypto.randomUUID(),
    version: 4,
    text: "old draft",
    format: { encoding: "utf-8" as const, eol: "lf" as const },
    sourcePath: null,
    sourceRevision: null,
    updatedAt: "now",
  };
  bridge.drafts.set(snapshot.recoveryId, snapshot);
  await c.restore(snapshot);
  await c.close();
  await c.discardAndClose();
  expect(bridge.drafts.has(snapshot.recoveryId)).toBe(false);
});
it("locks editing and cancellation while recovery is loading", async () => {
  const { c, bridge } = await setup();
  let resolve: ((o: typeof bridge.opened) => void) | undefined;
  bridge.restoreRecovery = () =>
    new Promise((r) => {
      resolve = r;
    });
  const snapshot = {
    sessionId: "old",
    epoch: 1,
    recoveryId: "draft",
    version: 1,
    text: "recover",
    format: { encoding: "utf-8" as const, eol: "lf" as const },
    sourcePath: null,
    sourceRevision: null,
    updatedAt: "now",
  };
  const restoring = c.restore(snapshot);
  expect(c.ui.busy).toBe(true);
  expect(c.view.state.readOnly).toBe(true);
  await c.cancelModal();
  expect(c.ui.busy).toBe(true);
  resolve!({ ...bridge.opened, sessionId: "restored", text: "recover" });
  await restoring;
  expect(c.text()).toBe("recover");
  expect(c.ui.busy).toBe(false);
});

it("reuses an empty window and keeps it intact when opening fails or is cancelled", async () => {
  const { c, bridge } = await setup();
  const before = c.ui.session!.sessionId;
  bridge.open = async (replacement) => {
    expect(replacement?.sessionId).toBe(before);
    expect(c.view.state.readOnly).toBe(true);
    return null;
  };
  await c.command("document.open");
  expect(c.ui.session!.sessionId).toBe(before);
  bridge.open = async () => {
    throw new Error("无法读取");
  };
  await c.command("document.open");
  expect(c.ui.session!.sessionId).toBe(before);
  expect(c.text()).toBe("");
  expect(c.ui.busy).toBe(false);
  bridge.open = async () => ({
    ...bridge.opened,
    sessionId: "new-file",
    path: "/notes/example.md",
    text: "# 新文件",
  });
  await c.command("document.open");
  expect(c.ui.session!.sessionId).toBe("new-file");
  expect(c.text()).toBe("# 新文件");
});

it("does not replace a draft when a native open request arrives", async () => {
  const { c, bridge } = await setup();
  c.view.dispatch({ changes: { from: 0, insert: "未保存的草稿" } });
  bridge.openPath = async (_path, replacement) => {
    expect(replacement).toBeUndefined();
    return null;
  };
  await c.openPath("/notes/example.md");
  expect(c.text()).toBe("未保存的草稿");
  c.undo();
  expect(c.text()).toBe("");
});

it("uploads a pasted image and maps its insertion point through continued typing", async () => {
  const { c, bridge } = await setup();
  localStorage.setItem(
    "wtypora.preferences.v1",
    JSON.stringify({ upload: { provider: "picgo" } }),
  );
  c.view.dispatch({
    changes: { from: 0, insert: "前后" },
    selection: { anchor: 1 },
  });
  let finish!: (url: string) => void;
  bridge.uploadImage = () =>
    new Promise<string>((resolve) => {
      finish = resolve;
    });
  const file = new File(["image"], "photo.png", { type: "image/png" });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new ArrayBuffer(1),
  });
  const uploading = c.pasteImages([file]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(c.ui.uploading).toBe(true);
  c.view.dispatch({ changes: { from: 0, insert: "新" } });
  finish("https://example.com/photo.png");
  await uploading;
  expect(c.text()).toBe("新前![photo.png](https://example.com/photo.png)\n后");
  expect(c.ui.uploading).toBe(false);
  localStorage.clear();
});

it("failed uploads leave the document untouched and allow retry", async () => {
  const { c, bridge } = await setup();
  localStorage.setItem(
    "wtypora.preferences.v1",
    JSON.stringify({ upload: { provider: "picgo" } }),
  );
  c.view.dispatch({ changes: { from: 0, insert: "原文" } });
  bridge.uploadImage = async () => {
    throw new Error("PicGo 未启动");
  };
  const file = new File(["image"], "photo.png", { type: "image/png" });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new ArrayBuffer(1),
  });
  await c.pasteImages([file]);
  expect(c.text()).toBe("原文");
  expect(c.ui.warning).toBe("PicGo 未启动");
  expect(c.ui.uploading).toBe(false);
  localStorage.clear();
});

it.each([
  ["empty", "![](https://example.com/photo%281%29.png)"],
  ["filename", "![photo.png](https://example.com/photo%281%29.png)"],
])(
  "uses the %s image description preference when inserting uploads",
  async (imageAlt, expected) => {
    const { c, bridge } = await setup();
    localStorage.setItem(
      "wtypora.preferences.v1",
      JSON.stringify({ upload: { provider: "picgo", imageAlt } }),
    );
    bridge.uploadImage = async () => "https://example.com/photo(1).png";
    const file = new File(["image"], "photo.png", { type: "image/png" });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new ArrayBuffer(1),
    });
    await c.pasteImages([file]);
    expect(c.text()).toBe(expected + "\n");
    expect(c.view.state.selection.main.head).toBe(c.view.state.doc.length);
    expect(c.view.state.doc.lineAt(c.view.state.selection.main.head).text).toBe(
      "",
    );
    localStorage.clear();
  },
);

it("queues a native open request while another operation locks the window", async () => {
  const { c, bridge } = await setup();
  let complete!: (opened: typeof bridge.opened | null) => void;
  bridge.open = () =>
    new Promise((resolve) => {
      complete = resolve;
    });
  let requests = 0;
  bridge.openPath = async () => {
    requests++;
    return null;
  };
  const pending = c.command("document.open");
  await c.openPath("/notes/queued.md");
  expect(requests).toBe(0);
  complete(null);
  await pending;
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(requests).toBe(1);
});

it("moves below the final image, supports immediate typing and undo/redo", async () => {
  const { c, bridge } = await setup();
  localStorage.setItem(
    "wtypora.preferences.v1",
    JSON.stringify({ upload: { provider: "picgo", imageAlt: "empty" } }),
  );
  bridge.uploadImage = async () => "https://example.com/photo.png";
  const file = new File(["image"], "photo.png", { type: "image/png" });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new ArrayBuffer(1),
  });
  await c.pasteImages([file, file]);
  const images = "![](https://example.com/photo.png)\n".repeat(2);
  expect(c.text()).toBe(images);
  expect(c.view.state.selection.main.head).toBe(images.length);
  c.view.dispatch({
    ...c.view.state.replaceSelection("继续写作"),
    userEvent: "input.type",
  });
  expect(c.text()).toBe(images + "继续写作");
  c.undo();
  expect(c.text()).toBe(images);
  c.redo();
  expect(c.text()).toBe(images + "继续写作");
  localStorage.clear();
});

it("does not move the caret back after the user moves away during upload", async () => {
  const { c, bridge } = await setup();
  localStorage.setItem(
    "wtypora.preferences.v1",
    JSON.stringify({ upload: { provider: "picgo" } }),
  );
  c.view.dispatch({
    changes: { from: 0, insert: "前文\n\n后文" },
    selection: { anchor: 3 },
  });
  let finish!: (url: string) => void;
  bridge.uploadImage = () =>
    new Promise<string>((resolve) => {
      finish = resolve;
    });
  const file = new File(["image"], "photo.png", { type: "image/png" });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new ArrayBuffer(1),
  });
  const pending = c.pasteImages([file]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  c.view.dispatch({ selection: { anchor: 0 } });
  finish("https://example.com/photo.png");
  await pending;
  expect(c.view.state.selection.main.head).toBe(0);
  expect(c.text()).toBe(
    "前文\n![photo.png](https://example.com/photo.png)\n\n后文",
  );
  localStorage.clear();
});

it("exports the unsaved snapshot without changing the session or undo history", async () => {
  const { c, bridge } = await setup();
  c.view.dispatch({ changes: { from: 0, insert: "# 未保存的中文\n\n结尾" } });
  const session = c.ui.session!;
  await c.command("document.exportDocx");
  expect(bridge.exports).toHaveLength(1);
  expect(bridge.exports[0].name).toBe("无标题.docx");
  expect(bridge.exports[0].sourcePath).toBeNull();
  expect(bridge.exports[0].bytes!.slice(0, 2)).toEqual([80, 75]);
  expect(c.ui.session!.sessionId).toBe(session.sessionId);
  expect(c.ui.session!.path).toBeNull();
  expect(c.ui.session!.phase).toBe("dirty");
  expect(bridge.disk).toBe("");
  expect(c.ui.exportStatus).toBe("已导出：无标题.docx");
  expect(document.querySelector("#wtypora-export")).toBeNull();
  c.undo();
  expect(c.text()).toBe("");
});

it.each(["pdf", "docx"] as const)(
  "dismisses the %s export success message after three seconds",
  async (format) => {
    const { c } = await setup();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await c.export(format);
    expect(c.ui.exportStatus).toBe(`已导出：无标题.${format}`);
    await vi.advanceTimersByTimeAsync(2999);
    expect(c.ui.exportStatus).toBe(`已导出：无标题.${format}`);
    await vi.advanceTimersByTimeAsync(1);
    expect(c.ui.exportStatus).toBeNull();
  },
);

it.each(["pdf", "docx"] as const)(
  "reveals the exported %s file in its folder",
  async (format) => {
    const { c, bridge } = await setup();
    await c.export(format);
    expect(bridge.revealed).toEqual([`/exports/无标题.${format}`]);
  },
);

it("keeps the success message when revealing the folder fails", async () => {
  const { c, bridge } = await setup();
  bridge.revealInFolder = async () => {
    throw new Error("访达不可用");
  };
  await c.export("pdf");
  expect(c.ui.exportStatus).toBe("已导出：无标题.pdf");
  expect(c.ui.warning).toBeNull();
});

it("does not reveal a folder when the export is cancelled", async () => {
  const { c, bridge } = await setup();
  bridge.exportDocument = async () => null;
  await c.export("pdf");
  expect(bridge.revealed).toEqual([]);
});

it("does not let the previous export timer clear a pending or newer export", async () => {
  const { c, bridge } = await setup();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  await c.export("pdf");
  await vi.advanceTimersByTimeAsync(2000);
  let finish!: (path: string) => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  bridge.exportDocument = () =>
    new Promise<string>((resolve) => {
      finish = resolve;
      started();
    });
  const pending = c.export("pdf");
  await ready;
  await vi.advanceTimersByTimeAsync(3000);
  expect(c.ui.exportStatus).toBe("正在导出…");
  finish("/exports/无标题.pdf");
  await pending;
  await vi.advanceTimersByTimeAsync(2999);
  expect(c.ui.exportStatus).toBe("已导出：无标题.pdf");
  await vi.advanceTimersByTimeAsync(1);
  expect(c.ui.exportStatus).toBeNull();
});

it("cleans up PDF rendering after cancellation and failure and restores editing", async () => {
  const { c, bridge } = await setup();
  c.view.dispatch({ changes: { from: 0, insert: "导出原文" } });
  bridge.exportDocument = async () => null;
  await c.command("document.exportPdf");
  expect(c.ui.warning).toBeNull();
  expect(c.ui.exportStatus).toBeNull();
  bridge.exportDocument = async () => {
    throw new Error("磁盘已满");
  };
  await c.command("document.exportPdf");
  expect(c.ui.warning).toContain("磁盘已满");
  expect(c.ui.busy).toBe(false);
  expect(document.querySelector("#wtypora-export")).toBeNull();
  c.view.dispatch({ changes: { from: c.text().length, insert: "，继续编辑" } });
  expect(c.text()).toBe("导出原文，继续编辑");
});

it("image validation warning expires five seconds after the latest attempt", async () => {
  const { c } = await setup();
  vi.useFakeTimers();
  localStorage.setItem(
    "wtypora.preferences.v1",
    JSON.stringify({ upload: { provider: "picgo" } }),
  );
  try {
    const file = new File(["image"], "photo.svg", { type: "image/svg+xml" });
    await c.pasteImages([file]);
    const warning = "支持 PNG、JPEG、GIF、WebP、BMP，每张图片最大 10 MB。";
    expect(c.ui.warning).toBe(warning);
    vi.advanceTimersByTime(4999);
    expect(c.ui.warning).toBe(warning);
    await c.pasteImages([file]);
    vi.advanceTimersByTime(4999);
    expect(c.ui.warning).toBe(warning);
    vi.advanceTimersByTime(1);
    expect(c.ui.warning).toBeNull();
    await c.pasteImages([file]);
    c.reportOpenError("打开失败");
    vi.advanceTimersByTime(5000);
    expect(c.ui.warning).toBe("打开失败");
  } finally {
    localStorage.clear();
  }
});
