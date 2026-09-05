import { it, expect, vi, afterEach } from "vitest";
import { createSaveQueue } from "./saveQueue";
import { fromOpened, reduceSession } from "./session";
import type { SaveReply, SaveRequest } from "./protocol";
afterEach(() => vi.useRealTimers());
function fixture() {
  let text = "one",
    disk = "",
    index = 0;
  let s = fromOpened({
    sessionId: "s",
    epoch: 1,
    path: "/a",
    text: "",
    format: { encoding: "utf-8", eol: "lf" },
    revision: null,
    readOnly: false,
  });
  const requests: SaveRequest[] = [];
  let release: (() => void) | null = null;
  let delayed = false;
  const q = createSaveQueue({
    getSession: () => s,
    snapshot: () => text,
    requestId: () => String(++index),
    dispatch: (e) => {
      s = reduceSession(s, e);
    },
    save: async (r) => {
      requests.push(r);
      if (delayed)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      disk = r.text;
      return {
        ...r,
        kind: "saved",
        revision: {
          hash: r.text,
          size: r.text.length,
          modifiedAtNs: "1",
          identity: "i",
        },
        durability: "confirmed",
      } as SaveReply;
    },
  });
  return {
    q,
    requests,
    get session() {
      return s;
    },
    get disk() {
      return disk;
    },
    edit(t: string) {
      text = t;
      s = reduceSession(s, { type: "edited", version: s.version + 1 });
      q.edited();
    },
    delay() {
      delayed = true;
    },
    release() {
      delayed = false;
      release?.();
    },
  };
}
it("debounces writes and persists actual latest text", async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.edit("first");
  await vi.advanceTimersByTimeAsync(999);
  expect(f.disk).toBe("");
  f.edit("latest");
  await vi.advanceTimersByTimeAsync(1000);
  expect(f.disk).toBe("latest");
  expect(f.session.phase).toBe("clean");
  f.q.dispose();
});
it("waits until composition ends even for manual save", async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.q.setComposing(true);
  f.edit("拼");
  let finished = false;
  const flushing = f.q.flush().then(() => {
    finished = true;
  });
  await vi.advanceTimersByTimeAsync(2000);
  expect(f.disk).toBe("");
  expect(finished).toBe(false);
  f.edit("拼音");
  f.q.setComposing(false);
  await flushing;
  expect(f.disk).toBe("拼音");
  f.q.dispose();
});
it("serializes in-flight saves and keeps latest request", async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.delay();
  f.edit("first");
  const flushing = f.q.flush();
  await Promise.resolve();
  f.edit("second");
  await vi.advanceTimersByTimeAsync(2000);
  expect(f.requests).toHaveLength(1);
  f.release();
  await flushing;
  expect(f.disk).toBe("second");
  expect(f.requests).toHaveLength(2);
  f.q.dispose();
});
it("disposal cancels a pending write", async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.edit("draft");
  f.q.dispose();
  await vi.advanceTimersByTimeAsync(2000);
  expect(f.disk).toBe("");
});
