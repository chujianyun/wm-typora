import { it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
  within,
} from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { App } from "./App";
import { FakeBridge } from "../native/fakeBridge";
it("shows the ten recent files and opens a selected path while preserving an edited document", async () => {
  const bridge = new FakeBridge();
  bridge.recentPaths = Array.from(
    { length: 10 },
    (_, i) => `/文档/${i}/笔记.md`,
  );
  const open = vi.spyOn(bridge, "openPath");
  render(<App bridge={bridge} />);
  const editor = await screen.findByRole("textbox", { name: "文档编辑器" });
  const view = EditorView.findFromDOM(editor)!;
  act(() => view.dispatch({ changes: { from: 0, insert: "未保存的草稿" } }));
  fireEvent.click(screen.getByRole("button", { name: "文档操作" }));
  fireEvent.click(screen.getByRole("button", { name: "最近打开…" }));
  const dialog = await screen.findByRole("dialog", { name: "最近打开" });
  await waitFor(() =>
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(10),
  );
  fireEvent.click(
    within(dialog).getByRole("button", { name: "打开 /文档/4/笔记.md" }),
  );
  await waitFor(() =>
    expect(open).toHaveBeenCalledWith("/文档/4/笔记.md", undefined),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(view.state.doc.toString()).toBe("未保存的草稿");
});

it("shows an empty history and reports missing recent files without losing the current document", async () => {
  const bridge = new FakeBridge();
  render(<App bridge={bridge} />);
  await screen.findByRole("textbox", { name: "文档编辑器" });
  const showRecent = () => {
    fireEvent.click(screen.getByRole("button", { name: "文档操作" }));
    fireEvent.click(screen.getByRole("button", { name: "最近打开…" }));
  };
  showRecent();
  expect(await screen.findByText("暂无最近打开的文件")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "关闭" }));
  bridge.recentPaths = ["/文档/已删除.md"];
  vi.spyOn(bridge, "openPath").mockRejectedValue(
    new Error("文件不存在或不是普通文件，请重新选择。"),
  );
  showRecent();
  fireEvent.click(
    await screen.findByRole("button", { name: "打开 /文档/已删除.md" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("文件不存在");
  expect(screen.getByRole("textbox", { name: "文档编辑器" })).toBeVisible();
});

it("reports history read failures in the recent files dialog", async () => {
  const bridge = new FakeBridge();
  vi.spyOn(bridge, "recentFiles").mockRejectedValue(new Error("unavailable"));
  render(<App bridge={bridge} />);
  await screen.findByRole("textbox", { name: "文档编辑器" });
  fireEvent.click(screen.getByRole("button", { name: "文档操作" }));
  fireEvent.click(screen.getByRole("button", { name: "最近打开…" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "无法读取最近打开记录",
  );
});
it("opens focused editing surface without a sidebar", async () => {
  render(<App bridge={new FakeBridge()} preview />);
  expect(
    await screen.findByRole("textbox", { name: "文档编辑器" }),
  ).toBeVisible();
  expect(screen.queryByRole("complementary")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "文档操作" }));
  expect(screen.getByRole("button", { name: "另存为…" })).toBeVisible();
});
it("offers opening on an empty document and surfaces picker failures without losing the editor", async () => {
  const bridge = new FakeBridge();
  bridge.open = async () => {
    throw new Error("文件读取失败");
  };
  render(<App bridge={bridge} />);
  const editor = await screen.findByRole("textbox", { name: "文档编辑器" });
  fireEvent.click(await screen.findByRole("button", { name: "⌘O 打开文件" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("文件读取失败");
  expect(editor).toBeVisible();
});

it("renders inactive Markdown blocks inside the default writing editor", async () => {
  const bridge = new FakeBridge();
  bridge.opened.text =
    "\n# 标题\n\n正文 **加粗** 与 *斜体* 和 ~~删除~~\n\n> 引用\n\n- [x] 完成\n- [ ] 待办\n\n| 项目 | 状态 |\n| --- | --- |\n| 预览 | 可用 |\n\n```js\nconst x = 1;\n```";
  render(<App bridge={bridge} />);
  const preview = await screen.findByRole("textbox", { name: "文档编辑器" });
  await waitFor(() =>
    expect(preview.querySelector(".live-markdown-block")).not.toBeNull(),
  );
  expect(
    within(preview).getByRole("heading", { name: "标题", level: 1 }),
  ).toBeVisible();
  expect(preview.querySelector("strong")).toHaveTextContent("加粗");
  expect(preview.querySelector("em")).toHaveTextContent("斜体");
  expect(preview.querySelector("del")).toHaveTextContent("删除");
  expect(preview.querySelector("blockquote")).toHaveTextContent("引用");
  expect(within(preview).getByRole("table")).toHaveTextContent("可用");
  expect(within(preview).getAllByRole("checkbox")[0]).toBeChecked();
  expect(within(preview).getAllByRole("checkbox")[0]).toBeDisabled();
  expect(preview.querySelector("pre code")).toHaveTextContent("const x = 1;");
  expect(screen.getByRole("button", { name: "撰写" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.queryByRole("button", { name: "预览" })).toBeNull();
});

it("keeps the same buffer, selection and undo history between writing and source and saves source bytes", async () => {
  const bridge = new FakeBridge();
  bridge.opened.text = "# 原文\n\n尾随空格  \n";
  render(<App bridge={bridge} />);
  const editor = await screen.findByRole("textbox", { name: "文档编辑器" });
  await waitFor(() => expect(editor).toHaveTextContent("原文"));
  const view = EditorView.findFromDOM(editor)!;
  act(() =>
    view.dispatch({
      changes: { from: 0, to: 4, insert: "# 修改" },
      selection: { anchor: 2 },
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "撰写" }));
  expect(editor).toHaveTextContent("修改");
  fireEvent.click(screen.getByRole("button", { name: "源码" }));
  expect(screen.getByRole("textbox", { name: "文档编辑器" })).toBe(editor);
  expect(view.state.selection.main.head).toBe(2);
  expect(view.state.doc.toString()).toBe("# 修改\n\n尾随空格  \n");
  fireEvent.click(screen.getByRole("button", { name: "文档操作" }));
  fireEvent.click(screen.getByRole("button", { name: "撤销" }));
  expect(view.state.doc.toString()).toBe("# 原文\n\n尾随空格  \n");
  fireEvent.click(screen.getByRole("button", { name: "撰写" }));
  fireEvent.click(screen.getByRole("button", { name: "文档操作" }));
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(bridge.disk).toBe("# 原文\n\n尾随空格  \n"));
});

it("renders remote Markdown images without executing raw HTML or navigating away from the document", async () => {
  const bridge = new FakeBridge();
  bridge.opened.text =
    '<script>alert(1)</script>\n\n<img src="https://example.com/tracker" onerror="alert(1)">\n\n![外部图片](https://example.com/tracker.png)\n\n[危险链接](javascript:alert%281%29)\n\n[网站](https://example.com)';
  render(<App bridge={bridge} />);
  const preview = await screen.findByRole("textbox", { name: "文档编辑器" });
  await waitFor(() =>
    expect(preview.querySelector(".live-markdown-block")).not.toBeNull(),
  );
  expect(preview.querySelector("script, iframe, [onerror]")).toBeNull();
  expect(preview.querySelectorAll("img")).toHaveLength(1);
  expect(
    within(preview).getByRole("img", { name: "外部图片" }),
  ).toHaveAttribute("src", "https://example.com/tracker.png");
  expect(preview.querySelector('[href^="javascript:"]')).toBeNull();
  const link = within(preview).getByRole("link", { name: "网站" });
  expect(fireEvent.click(link)).toBe(false);
});

it("offers Word and PDF export from the document menu and shows completion", async () => {
  const bridge = new FakeBridge();
  bridge.opened.text = "# 导出标题\n\n正文";
  render(<App bridge={bridge} />);
  await screen.findByRole("textbox", { name: "文档编辑器" });
  fireEvent.click(screen.getByRole("button", { name: "文档操作" }));
  expect(
    screen.getByRole("button", { name: "导出 Word（.docx）…" }),
  ).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "导出 PDF…" }));
  await waitFor(() => expect(bridge.exports).toHaveLength(1));
  expect(bridge.exports[0].format).toBe("pdf");
  expect(await screen.findByText("已导出：无标题.pdf")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "文档编辑器" })).toBeVisible();
});
