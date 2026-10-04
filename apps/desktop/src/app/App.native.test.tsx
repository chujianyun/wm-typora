import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { App } from "./App";
import { FakeBridge } from "../native/fakeBridge";

afterEach(() => {
  cleanup();
  clearMocks();
  vi.unstubAllGlobals();
});

it("subscribes each document to its own native command target and cleans up on unmount", async () => {
  vi.stubGlobal("isTauri", true);
  const ipc = vi.fn(() => 1);
  mockIPC(ipc);

  for (const label of ["first", "second"]) {
    ipc.mockClear();
    mockWindows(label);
    const view = render(<App bridge={new FakeBridge()} />);
    await waitFor(() => {
      expect(ipc).toHaveBeenCalledWith("plugin:event|listen", {
        event: "document-command",
        // Global Any listeners receive even events addressed to other windows.
        target: { kind: "Window", label },
        handler: expect.any(Number),
      });
    });
    view.unmount();
    await waitFor(() => {
      expect(ipc).toHaveBeenCalledWith("plugin:event|unlisten", {
        event: "document-command",
        eventId: 1,
      });
    });
  }
});
