import capability from "../../src-tauri/capabilities/default.json";

describe("Tauri main-window capabilities", () => {
  it("allows the application menu to request a graceful window close", () => {
    expect(capability.permissions).toContain("core:window:allow-close");
  });

  it("allows a confirmed discard to destroy the window", () => {
    expect(capability.permissions).toContain("core:window:allow-destroy");
  });

  it("allows the native WebView print command used by Print / PDF", () => {
    expect(capability.permissions).toContain("core:webview:allow-print");
  });
});
