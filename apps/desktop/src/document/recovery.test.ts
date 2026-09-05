import { it, expect, vi, afterEach } from "vitest";
import { createRecoveryQueue } from "./recovery";
import type { RecoverySnapshot } from "./protocol";
afterEach(() => vi.useRealTimers());
it("persists latest snapshot even during continuous typing", async () => {
  vi.useFakeTimers();
  let text = "";
  let saved = "";
  const q = createRecoveryQueue(
    () =>
      ({
        sessionId: "s",
        epoch: 1,
        recoveryId: "r",
        version: text.length,
        text,
        format: { encoding: "utf-8", eol: "lf" },
        sourcePath: null,
        sourceRevision: null,
        updatedAt: "now",
      }) as RecoverySnapshot,
    async (s) => {
      saved = s.text;
      return s.version;
    },
    (e) => {
      throw e;
    },
  );
  for (let i = 0; i < 21; i++) {
    text += "x";
    q.schedule();
    await vi.advanceTimersByTimeAsync(100);
  }
  expect(saved.length).toBeGreaterThanOrEqual(20);
  await q.flush();
  expect(saved).toBe(text);
  q.dispose();
});
