import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FindPanel } from "./FindPanel";

describe("FindPanel", () => {
  it("shows match counts and replaces every literal match", async () => {
    const user = userEvent.setup();
    const onReplace = vi.fn();
    render(
      <FindPanel markdown="alpha beta alpha" onReplace={onReplace} onClose={() => undefined} />,
    );

    await user.type(screen.getByRole("searchbox", { name: "查找" }), "alpha");
    expect(screen.getByText("1 / 2")).toBeVisible();

    await user.type(screen.getByRole("textbox", { name: "替换为" }), "gamma");
    await user.click(screen.getByRole("button", { name: "全部替换" }));
    expect(onReplace).toHaveBeenCalledWith("gamma beta gamma");
  });
});
