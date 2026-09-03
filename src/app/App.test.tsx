import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useDocumentStore } from "../document/documentStore";
import { createMemoryNativeBridge } from "../native/browserBridge";
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

    await user.click(screen.getByRole("button", { name: "打开文件夹" }));

    expect(await screen.findByRole("button", { name: "guide.md" })).toBeVisible();
    expect(screen.queryByText("image.png")).not.toBeInTheDocument();
  });
});
