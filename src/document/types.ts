export type SaveStatus = "clean" | "dirty" | "saving" | "error";

export interface ExternalDocument {
  markdown: string;
  modifiedAt: number;
}

export interface DocumentState {
  path: string | null;
  markdown: string;
  persistedMarkdown: string;
  modifiedAt: number | null;
  saveStatus: SaveStatus;
  saveError: string | null;
  recoveryId: string;
  pendingExternal: ExternalDocument | null;
}

export interface OpenDocumentInput {
  path: string;
  markdown: string;
  modifiedAt: number;
}

export type ExternalChangeResult = "reloaded" | "conflict";
export type ExternalConflictChoice = "reload" | "keep";
