export interface AutosaveController {
  schedule: (hasPath: boolean) => void;
  cancel: () => void;
  flush: () => Promise<void>;
}

export function scheduleAutosave(
  save: () => void | Promise<void>,
  delay = 800,
): AutosaveController {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  return {
    schedule(hasPath) {
      cancel();
      if (!hasPath) return;
      timer = setTimeout(() => {
        timer = null;
        void save();
      }, delay);
    },
    cancel,
    async flush() {
      cancel();
      await save();
    },
  };
}
