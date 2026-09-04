import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TitleBar } from "./TitleBar";

function renderTitleBar() {
  const handlers = {
    onNew: vi.fn(),
    onOpen: vi.fn(),
    onOpenWorkspace: vi.fn(),
    onSave: vi.fn(),
    onSaveAs: vi.fn(),
    onToggleSidebar: vi.fn(),
    onToggleMode: vi.fn(),
    onToggleFind: vi.fn(),
    onExportHtml: vi.fn(),
    onPrint: vi.fn(),
    onCycleTheme: vi.fn(),
  };

  render(
    <TitleBar
      fileName="notes.md"
      saveStatus="dirty"
      mode="visual"
      theme="system"
      {...handlers}
    />,
  );

  return handlers;
}

describe("TitleBar", () => {
  it("keeps secondary document commands in a dismissible more menu", async () => {
    const user = userEvent.setup();
    const handlers = renderTitleBar();

    expect(screen.queryByRole("button", { name: "保存文档" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "更多操作" }));

    expect(screen.getByRole("menu", { name: "更多操作" })).toBeVisible();
    await user.click(screen.getByRole("menuitem", { name: "保存" }));

    expect(handlers.onSave).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu", { name: "更多操作" })).not.toBeInTheDocument();
  });

  it.each([
    ["打开文件夹", "onOpenWorkspace"],
    ["保存", "onSave"],
    ["另存为", "onSaveAs"],
    ["导出 HTML", "onExportHtml"],
    ["打印或导出 PDF", "onPrint"],
  ] as const)("runs the %s more-menu command", async (menuItem, handlerName) => {
    const user = userEvent.setup();
    const handlers = renderTitleBar();

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(screen.getByRole("menuitem", { name: menuItem }));

    expect(handlers[handlerName]).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu", { name: "更多操作" })).not.toBeInTheDocument();
  });

  it("leaves the frequent editing commands one click away", () => {
    renderTitleBar();

    expect(screen.getByRole("button", { name: "切换侧栏" })).toBeVisible();
    expect(screen.getByRole("button", { name: "新建文档" })).toBeVisible();
    expect(screen.getByRole("button", { name: "打开文件" })).toBeVisible();
    expect(screen.getByRole("button", { name: "查找与替换" })).toBeVisible();
    expect(screen.getByRole("button", { name: "源码模式" })).toBeVisible();
    expect(screen.getByRole("button", { name: "切换主题" })).toBeVisible();
  });
});
