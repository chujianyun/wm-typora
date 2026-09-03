import { listRecoveryDrafts, removeRecoveryDraft, upsertRecoveryDraft } from "./recovery";

describe("recovery drafts", () => {
  beforeEach(() => localStorage.clear());

  it("persists dirty Markdown locally and removes it after resolution", () => {
    upsertRecoveryDraft(
      {
        recoveryId: "draft-1",
        path: null,
        markdown: "never lose this",
        savedAt: 42,
      },
      localStorage,
    );

    expect(listRecoveryDrafts(localStorage)).toEqual([
      {
        recoveryId: "draft-1",
        path: null,
        markdown: "never lose this",
        savedAt: 42,
      },
    ]);

    removeRecoveryDraft("draft-1", localStorage);
    expect(listRecoveryDrafts(localStorage)).toEqual([]);
  });
});
