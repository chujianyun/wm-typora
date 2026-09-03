import { scheduleAutosave } from "./autosave";

describe("scheduleAutosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves a named document after 800 ms without input", async () => {
    const save = vi.fn();
    const autosave = scheduleAutosave(save);

    autosave.schedule(true);
    await vi.advanceTimersByTimeAsync(799);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("resets the timer and never auto-saves an unnamed document", async () => {
    const save = vi.fn();
    const autosave = scheduleAutosave(save);

    autosave.schedule(true);
    await vi.advanceTimersByTimeAsync(700);
    autosave.schedule(true);
    await vi.advanceTimersByTimeAsync(700);
    expect(save).not.toHaveBeenCalled();

    autosave.schedule(false);
    await vi.advanceTimersByTimeAsync(800);
    expect(save).not.toHaveBeenCalled();
  });

  it("lets an explicit save preempt the pending timer", async () => {
    const save = vi.fn();
    const autosave = scheduleAutosave(save);

    autosave.schedule(true);
    await autosave.flush();
    await vi.advanceTimersByTimeAsync(800);

    expect(save).toHaveBeenCalledTimes(1);
  });
});
