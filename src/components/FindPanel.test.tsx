import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FindPanel } from "./FindPanel";

describe("FindPanel", () => {
  it("shows match counts and replaces every literal match", async () => {
    const user = userEvent.setup();
    const onReplace = vi.fn();
    const onNavigate = vi.fn();
    render(
      <FindPanel
        countMatches={(query) => "alpha beta alpha".split(query).length - 1}
        onReplace={onReplace}
        onNavigate={onNavigate}
        onClose={() => undefined}
      />,
    );

    await user.type(screen.getByRole("searchbox", { name: "查找" }), "alpha");
    expect(screen.getByText("1 / 2")).toBeVisible();
    expect(onNavigate).toHaveBeenLastCalledWith("alpha", 0);

    await user.click(screen.getByRole("button", { name: "下一个匹配" }));
    expect(screen.getByText("2 / 2")).toBeVisible();
    expect(onNavigate).toHaveBeenLastCalledWith("alpha", 1);

    await user.click(screen.getByRole("button", { name: "上一个匹配" }));
    expect(screen.getByText("1 / 2")).toBeVisible();

    await user.type(screen.getByRole("textbox", { name: "替换为" }), "gamma");
    await user.click(screen.getByRole("button", { name: "全部替换" }));
    expect(onReplace).toHaveBeenCalledWith("alpha", "gamma");
  });
});
