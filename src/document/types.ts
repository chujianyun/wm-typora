export type SaveStatus = "clean" | "dirty" | "saving" | "error";

export interface ExternalDocument {
  markdown: string;
  modifiedAt: number;
  digest: string | null;
}

export interface DocumentState {
  path: string | null;
  markdown: string;
  persistedMarkdown: string;
  persistedDigest: string | null;
  savingMarkdown: string | null;
  modifiedAt: number | null;
  saveStatus: SaveStatus;
  saveError: string | null;
  autosaveSuppressed: boolean;
  recoveryId: string;
  pendingExternal: ExternalDocument | null;
}

export interface OpenDocumentInput {
  path: string;
  markdown: string;
  modifiedAt: number;
  digest?: string;
}

export type ExternalChangeResult = "ignored" | "reloaded" | "conflict";
export type ExternalConflictChoice = "reload" | "keep";
