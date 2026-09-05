import { it, expect } from "vitest";
import { fromOpened, reduceSession } from "./session";
import type { Opened, SaveRequest, Revision } from "./protocol";
const o: Opened = {
  sessionId: "s",
  epoch: 1,
  path: "/a.md",
  text: "",
  format: { encoding: "utf-8", eol: "lf" },
  revision: null,
  readOnly: false,
};
const r: Revision = { hash: "h", size: 2, modifiedAtNs: "1", identity: "i" };
const req: SaveRequest = {
  sessionId: "s",
  epoch: 1,
  requestId: "r",
  version: 1,
  text: "a",
  expected: null,
};
it("acknowledges saved version while preserving later edits", () => {
  let s = reduceSession(fromOpened(o), { type: "edited", version: 1 });
  s = reduceSession(s, { type: "saveStarted", request: req });
  s = reduceSession(s, { type: "edited", version: 2 });
  s = reduceSession(s, {
    type: "saveFinished",
    reply: { ...req, kind: "saved", revision: r, durability: "confirmed" },
  });
  expect(s.persistedVersion).toBe(1);
  expect(s.version).toBe(2);
  expect(s.phase).toBe("dirty");
  expect(s.revision).toEqual(r);
});
it("rejects stale response from different epoch", () => {
  const s = fromOpened(o);
  expect(
    reduceSession(s, {
      type: "saveFinished",
      reply: {
        ...req,
        epoch: 0,
        kind: "saved",
        revision: r,
        durability: "confirmed",
      },
    }),
  ).toBe(s);
});
it("does not clear an external conflict with late save success", () => {
  let s = reduceSession(fromOpened(o), { type: "edited", version: 1 });
  s = reduceSession(s, { type: "saveStarted", request: req });
  s = reduceSession(s, {
    type: "diskChanged",
    event: {
      sessionId: "s",
      epoch: 1,
      eventSeq: 1,
      kind: "changed",
      revision: r,
    },
  });
  s = reduceSession(s, {
    type: "saveFinished",
    reply: { ...req, kind: "saved", revision: r, durability: "confirmed" },
  });
  expect(s.phase).toBe("conflict");
});
it("uncertain durability prevents clean close", () => {
  let s = reduceSession(fromOpened(o), { type: "edited", version: 1 });
  s = reduceSession(s, { type: "saveStarted", request: req });
  s = reduceSession(s, {
    type: "saveFinished",
    reply: { ...req, kind: "saved", revision: r, durability: "uncertain" },
  });
  expect(s.phase).toBe("error");
  expect(s.durability).toBe("uncertain");
});
it("rejects stale or future snapshots before starting a save", () => {
  const s = reduceSession(fromOpened(o), { type: "edited", version: 2 });
  expect(reduceSession(s, { type: "saveStarted", request: req })).toBe(s);
  expect(
    reduceSession(s, { type: "saveStarted", request: { ...req, version: 3 } }),
  ).toBe(s);
});
it("ignores mismatched and duplicate acknowledgements without rolling back the baseline", () => {
  const dirty = reduceSession(fromOpened(o), { type: "edited", version: 1 });
  const saving = reduceSession(dirty, { type: "saveStarted", request: req });
  const reply = {
    ...req,
    kind: "saved" as const,
    revision: r,
    durability: "confirmed" as const,
  };
  for (const changed of [
    { requestId: "old" },
    { version: 0 },
    { epoch: 0 },
    { sessionId: "other" },
  ])
    expect(
      reduceSession(saving, {
        type: "saveFinished",
        reply: { ...reply, ...changed },
      }),
    ).toBe(saving);
  const saved = reduceSession(saving, { type: "saveFinished", reply });
  expect(saved.phase).toBe("clean");
  expect(reduceSession(saved, { type: "saveFinished", reply })).toBe(saved);
  expect(reduceSession(saved, { type: "edited", version: 0 })).toBe(saved);
});
