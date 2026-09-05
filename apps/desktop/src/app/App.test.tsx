import { it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { App } from "./App";
import { FakeBridge } from "../native/fakeBridge";
it("opens focused editing surface without a sidebar", async () => {
  render(<App bridge={new FakeBridge()} preview />);
  expect(
    await screen.findByRole("textbox", { name: "文档编辑器" }),
  ).toBeVisible();
  expect(screen.queryByRole("complementary")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "文档操作" }));
  expect(screen.getByRole("button", { name: "另存为…" })).toBeVisible();
});
