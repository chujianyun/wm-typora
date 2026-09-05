import type { SaveReply, SaveRequest, Session } from "./protocol";
import { failure } from "./protocol";
import type { SessionEvent } from "./session";
export interface SaveDependencies {
  getSession(): Session;
  snapshot(): string;
  save(r: SaveRequest): Promise<SaveReply>;
  dispatch(e: SessionEvent): void;
  requestId(): string;
}
export interface SaveQueue {
  edited(): void;
  setComposing(value: boolean): void;
  flush(): Promise<void>;
  dispose(): void;
  idle(): Promise<void>;
}
export function createSaveQueue(d: SaveDependencies): SaveQueue {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false,
    composing = false;
  let running: Promise<void> | null = null;
  const compositionWaiters = new Set<() => void>();
  function cancel() {
    clearTimeout(timer);
    timer = undefined;
  }
  async function drain() {
    while (!disposed) {
      const s = d.getSession();
      if (
        composing ||
        !s.path ||
        s.readOnly ||
        ["clean", "conflict", "error"].includes(s.phase)
      )
        return;
      const req: SaveRequest = {
        sessionId: s.sessionId,
        epoch: s.epoch,
        requestId: d.requestId(),
        version: s.version,
        text: d.snapshot(),
        expected: s.revision,
      };
      d.dispatch({ type: "saveStarted", request: req });
      let reply: SaveReply;
      try {
        reply = await d.save(req);
      } catch (e) {
        reply = { ...req, kind: "failed", error: failure(e) };
      }
      if (disposed) return;
      d.dispatch({ type: "saveFinished", reply });
    }
  }
  async function flush() {
    cancel();
    if (disposed) return;
    if (composing)
      await new Promise<void>((resolve) => compositionWaiters.add(resolve));
    if (disposed) return;
    if (running) {
      await running;
      if (!disposed && d.getSession().phase === "dirty") return flush();
      return;
    }
    running = drain();
    try {
      await running;
    } finally {
      running = null;
    }
  }
  return {
    edited() {
      cancel();
      if (!disposed)
        timer = setTimeout(() => {
          void flush();
        }, 1000);
    },
    setComposing(value) {
      composing = value;
      if (!value) {
        for (const resolve of compositionWaiters) resolve();
        compositionWaiters.clear();
      }
    },
    flush,
    dispose() {
      disposed = true;
      cancel();
      for (const resolve of compositionWaiters) resolve();
      compositionWaiters.clear();
    },
    async idle() {
      cancel();
      if (running) await running;
    },
  };
}
