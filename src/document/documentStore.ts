import { create } from "zustand";
import type {
  DocumentState,
  ExternalChangeResult,
  ExternalConflictChoice,
  OpenDocumentInput,
} from "./types";

interface DocumentActions {
  newDocument: () => void;
  openDocument: (input: OpenDocumentInput) => void;
  updateMarkdown: (markdown: string) => void;
  startSaving: () => void;
  saveSucceeded: (modifiedAt: number) => void;
  saveFailed: (message: string) => void;
  applyExternalChange: (
    markdown: string,
    modifiedAt: number,
  ) => ExternalChangeResult;
  resolveExternalConflict: (choice: ExternalConflictChoice) => void;
}

export type DocumentStore = DocumentState & DocumentActions;

function recoveryId() {
  return globalThis.crypto?.randomUUID?.() ?? `draft-${Date.now()}`;
}

function emptyDocument(): DocumentState {
  return {
    path: null,
    markdown: "",
    persistedMarkdown: "",
    modifiedAt: null,
    saveStatus: "clean",
    saveError: null,
    recoveryId: recoveryId(),
    pendingExternal: null,
  };
}

export const useDocumentStore = create<DocumentStore>()((set, get) => ({
  ...emptyDocument(),
  newDocument: () => set(emptyDocument()),
  openDocument: ({ path, markdown, modifiedAt }) =>
    set({
      ...emptyDocument(),
      path,
      markdown,
      persistedMarkdown: markdown,
      modifiedAt,
    }),
  updateMarkdown: (markdown) =>
    set((state) => ({
      markdown,
      saveError: null,
      saveStatus: markdown === state.persistedMarkdown ? "clean" : "dirty",
    })),
  startSaving: () => set({ saveStatus: "saving", saveError: null }),
  saveSucceeded: (modifiedAt) =>
    set((state) => ({
      persistedMarkdown: state.markdown,
      modifiedAt,
      saveStatus: "clean",
      saveError: null,
    })),
  saveFailed: (saveError) => set({ saveStatus: "error", saveError }),
  applyExternalChange: (markdown, modifiedAt) => {
    if (get().saveStatus === "clean") {
      set({
        markdown,
        persistedMarkdown: markdown,
        modifiedAt,
        pendingExternal: null,
      });
      return "reloaded";
    }

    set({ pendingExternal: { markdown, modifiedAt } });
    return "conflict";
  },
  resolveExternalConflict: (choice) =>
    set((state) => {
      const external = state.pendingExternal;
      if (!external) return {};
      if (choice === "reload") {
        return {
          markdown: external.markdown,
          persistedMarkdown: external.markdown,
          modifiedAt: external.modifiedAt,
          saveStatus: "clean",
          saveError: null,
          pendingExternal: null,
        };
      }
      return {
        persistedMarkdown: external.markdown,
        modifiedAt: external.modifiedAt,
        saveStatus:
          state.markdown === external.markdown ? ("clean" as const) : ("dirty" as const),
        pendingExternal: null,
      };
    }),
}));
