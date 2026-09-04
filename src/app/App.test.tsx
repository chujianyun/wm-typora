import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useDocumentStore } from "../document/documentStore";
import { createMemoryNativeBridge } from "../native/browserBridge";
import type { FileSnapshot } from "../native/types";
import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    useDocumentStore.getState().newDocument();
    localStorage.clear();
  });

  it("renders the WTypora application title", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "WTypora" })).toBeVisible();
  });

  it("opens a document and switches to the lossless source editor", async () => {
    const user = userEvent.setup();
    const bridge = createMemoryNativeBridge({
      files: { "/notes/hello.md": "# Opened note" },
      openPath: "/notes/hello.md",
    });
    render(<App bridge={bridge} />);

    await user.click(screen.getByRole("button", { name: "打开文件" }));
    expect(await screen.findByText("hello.md")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "源码模式" }));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Markdown source editor" })).toHaveTextContent(
        "Opened note",
      ),
    );
  });

  it("opens a document requested by the desktop shell", async () => {
    const path = "/notes/opened-from-finder.md";
    const memory = createMemoryNativeBridge({
      files: { [path]: "# Opened from Finder" },
    });
    const bridge = {
      ...memory,
      async watchOpenFiles(onOpen: (path: string) => void) {
        onOpen(path);
        return async () => undefined;
      },
    };

    render(<App bridge={bridge} />);

    expect(await screen.findByText("opened-from-finder.md")).toBeVisible();
    expect(useDocumentStore.getState()).toMatchObject({
      path,
      markdown: "# Opened from Finder",
    });
  });

  it("shows a save decision before replacing dirty content", async () => {
    const user = userEvent.setup();
    render(<App />);
    useDocumentStore.getState().updateMarkdown("unsaved");

    await user.click(screen.getByRole("button", { name: "新建文档" }));

    expect(screen.getByRole("dialog", { name: "保存更改" })).toBeVisible();
    expect(screen.getByRole("button", { name: "放弃" })).toBeVisible();
    expect(screen.getByRole("button", { name: "取消" })).toBeVisible();
  });

  it("opens a workspace and displays only supported files", async () => {
    const user = userEvent.setup();
    const bridge = createMemoryNativeBridge({
      files: {
        "/notes/guide.md": "guide",
        "/notes/image.png": "image",
      },
      workspacePath: "/notes",
    });
    render(<App bridge={bridge} />);

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(screen.getByRole("menuitem", { name: "打开文件夹" }));

    expect(await screen.findByRole("button", { name: "guide.md" })).toBeVisible();
    expect(screen.queryByText("image.png")).not.toBeInTheDocument();
  });

  it("exports the current Markdown as safe standalone HTML", async () => {
    const user = userEvent.setup();
    const memory = createMemoryNativeBridge();
    const exportHtml = vi.fn().mockResolvedValue("/Downloads/Untitled.html");
    useDocumentStore.getState().updateMarkdown("# Export me\n\n<script>bad()</script>");
    render(<App bridge={{ ...memory, exportHtml }} />);

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(screen.getByRole("menuitem", { name: "导出 HTML" }));

    await waitFor(() => expect(exportHtml).toHaveBeenCalledTimes(1));
    const [html, name] = exportHtml.mock.calls[0];
    expect(name).toBe("Untitled.html");
    expect(html).toContain("<h1>Export me</h1>");
    expect(html).not.toContain("<script>");
  });

  it("keeps the original suggested name when the document changes during export", async () => {
    const user = userEvent.setup();
    const bridge = createMemoryNativeBridge();
    const exportHtml = vi.fn().mockResolvedValue("/Downloads/a.html");
    useDocumentStore.getState().openDocument({
      path: "/notes/a.md",
      markdown: "```mermaid\nflowchart LR\nA-->B\n```",
      modifiedAt: 1,
      digest: "a-digest",
    });
    render(<App bridge={{ ...bridge, exportHtml }} />);

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(screen.getByRole("menuitem", { name: "导出 HTML" }));
    act(() => {
      useDocumentStore.getState().openDocument({
        path: "/notes/b.md",
        markdown: "# B",
        modifiedAt: 2,
        digest: "b-digest",
      });
    });

    await waitFor(() => expect(exportHtml).toHaveBeenCalledOnce());
    expect(exportHtml.mock.calls[0][1]).toBe("a.html");
  });

  it("blocks unsupported anchor schemes from navigating the editor WebView", () => {
    render(<App />);
    const anchor = document.createElement("a");
    anchor.href = "file:///private/notes.md";
    document.body.append(anchor);

    const dispatched = anchor.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );

    expect(dispatched).toBe(false);
  });

  it("toggles focus and typewriter modes from global shortcuts", async () => {
    render(<App />);
    const focus = screen.getByRole("button", { name: "专注" });
    const typewriter = screen.getByRole("button", { name: "打字机" });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "d", metaKey: true, shiftKey: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "t", metaKey: true, shiftKey: true }));

    await waitFor(() => expect(focus).toHaveAttribute("aria-pressed", "true"));
    expect(typewriter).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the search field focused while entering a multi-character query", async () => {
    const user = userEvent.setup();
    useDocumentStore.getState().updateMarkdown("alpha beta alpha");
    render(<App />);
    await user.click(screen.getByRole("button", { name: "查找与替换" }));
    const search = screen.getByRole("searchbox", { name: "查找" });

    await user.type(search, "alpha");

    expect(search).toHaveValue("alpha");
    expect(search).toHaveFocus();
    expect(screen.getByText("1 / 2")).toBeVisible();
  });

  it("ignores an old watcher read that finishes after switching documents", async () => {
    let onFileChange: ((path: string) => void) | null = null;
    let resolveRead!: (snapshot: FileSnapshot) => void;
    const pendingRead = new Promise<FileSnapshot>((resolve) => {
      resolveRead = resolve;
    });
    const bridge = createMemoryNativeBridge();
    bridge.watchFile = vi.fn(async (_path, onChange) => {
      onFileChange = onChange;
      return async () => undefined;
    });
    bridge.readFile = vi.fn(() => pendingRead);
    useDocumentStore.getState().openDocument({
      path: "/notes/a.md",
      markdown: "a",
      modifiedAt: 1,
      digest: "a-digest",
    });
    render(<App bridge={bridge} />);
    await waitFor(() => expect(onFileChange).not.toBeNull());

    onFileChange!("/notes/a.md");
    await waitFor(() => expect(bridge.readFile).toHaveBeenCalledWith("/notes/a.md"));
    useDocumentStore.getState().openDocument({
      path: "/notes/b.md",
      markdown: "b",
      modifiedAt: 2,
      digest: "b-digest",
    });
    resolveRead({
      path: "/notes/a.md",
      name: "a.md",
      markdown: "external a",
      modifiedAt: 3,
      digest: "external-a-digest",
    });

    await waitFor(() => expect(useDocumentStore.getState().path).toBe("/notes/b.md"));
    expect(useDocumentStore.getState()).toMatchObject({
      markdown: "b",
      pendingExternal: null,
    });
  });
});
