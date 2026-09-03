import { render, screen } from "@testing-library/react";
import { App } from "./App";

describe("App", () => {
  it("renders the WTypora application title", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "WTypora" })).toBeVisible();
  });
});
