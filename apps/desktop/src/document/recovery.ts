import type { RecoverySnapshot } from "./protocol";
export function createRecoveryQueue(
  snapshot: () => RecoverySnapshot | null,
  write: (s: RecoverySnapshot) => Promise<number>,
  report: (e: unknown) => void,
) {
  let debounce: ReturnType<typeof setTimeout> | undefined,
    max: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | null = null,
    pending = false,
    disposed = false;
  function cancel() {
    clearTimeout(debounce);
    clearTimeout(max);
    debounce = undefined;
    max = undefined;
  }
  async function flush() {
    cancel();
    if (disposed) return;
    if (running) {
      pending = true;
      await running;
      return;
    }
    running = (async () => {
      do {
        pending = false;
        const s = snapshot();
        if (s) await write(s);
      } while (pending && !disposed);
    })();
    try {
      await running;
    } catch (e) {
      report(e);
      throw e;
    } finally {
      running = null;
    }
  }
  function scheduledFlush() {
    void flush().catch(() => {
      /* report has surfaced this error */
    });
  }
  return {
    schedule() {
      if (disposed) return;
      clearTimeout(debounce);
      debounce = setTimeout(scheduledFlush, 500);
      max ??= setTimeout(scheduledFlush, 2000);
    },
    flush,
    async idle() {
      cancel();
      if (running) await running;
    },
    dispose() {
      disposed = true;
      cancel();
    },
  };
}
