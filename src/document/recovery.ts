export interface RecoveryDraft {
  recoveryId: string;
  path: string | null;
  markdown: string;
  savedAt: number;
}

const RECOVERY_KEY = "wtypora.recovery-drafts.v1";

export function listRecoveryDrafts(storage: Storage = localStorage): RecoveryDraft[] {
  try {
    const value = JSON.parse(storage.getItem(RECOVERY_KEY) ?? "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter(
      (draft): draft is RecoveryDraft =>
        typeof draft === "object" &&
        draft !== null &&
        typeof draft.recoveryId === "string" &&
        (typeof draft.path === "string" || draft.path === null) &&
        typeof draft.markdown === "string" &&
        typeof draft.savedAt === "number",
    );
  } catch {
    return [];
  }
}

export function upsertRecoveryDraft(
  draft: RecoveryDraft,
  storage: Storage = localStorage,
) {
  const drafts = listRecoveryDrafts(storage).filter(
    (candidate) => candidate.recoveryId !== draft.recoveryId,
  );
  storage.setItem(RECOVERY_KEY, JSON.stringify([...drafts, draft]));
}

export function removeRecoveryDraft(
  recoveryId: string,
  storage: Storage = localStorage,
) {
  const drafts = listRecoveryDrafts(storage).filter(
    (candidate) => candidate.recoveryId !== recoveryId,
  );
  storage.setItem(RECOVERY_KEY, JSON.stringify(drafts));
}
