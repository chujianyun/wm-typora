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
  startSaving: (markdown?: string) => void;
  saveSucceeded: (
    persistedMarkdown: string,
    modifiedAt: number,
    digest?: string | null,
    resumeAutosave?: boolean,
  ) => void;
  saveAsSucceeded: (
    path: string,
    persistedMarkdown: string,
    modifiedAt: number,
    digest?: string | null,
  ) => void;
  cancelSaving: () => void;
  saveFailed: (message: string) => void;
  applyExternalChange: (
    markdown: string,
    modifiedAt: number,
    digest?: string | null,
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
    persistedDigest: null,
    savingMarkdown: null,
    modifiedAt: null,
    saveStatus: "clean",
    saveError: null,
    autosaveSuppressed: false,
    recoveryId: recoveryId(),
    pendingExternal: null,
  };
}

export const useDocumentStore = create<DocumentStore>()((set, get) => ({
  ...emptyDocument(),
  newDocument: () => set(emptyDocument()),
  openDocument: ({ path, markdown, modifiedAt, digest }) =>
    set({
      ...emptyDocument(),
      path,
      markdown,
      persistedMarkdown: markdown,
      persistedDigest: digest ?? null,
      modifiedAt,
    }),
  updateMarkdown: (markdown) =>
    set((state) => ({
      markdown,
      saveError: null,
      saveStatus: markdown === state.persistedMarkdown ? "clean" : "dirty",
      autosaveSuppressed:
        markdown === state.persistedMarkdown ? false : state.autosaveSuppressed,
    })),
  startSaving: (markdown) =>
    set((state) => ({
      saveStatus: "saving",
      saveError: null,
      savingMarkdown: markdown ?? state.markdown,
    })),
  saveSucceeded: (persistedMarkdown, modifiedAt, digest = null, resumeAutosave = false) =>
    set((state) => {
      const conflictPending = state.pendingExternal !== null;
      return {
        persistedMarkdown,
        persistedDigest: digest,
        modifiedAt,
        savingMarkdown: null,
        saveStatus: conflictPending || state.markdown !== persistedMarkdown ? "dirty" : "clean",
        saveError: null,
        autosaveSuppressed: conflictPending
          ? true
          : resumeAutosave ? false : state.autosaveSuppressed,
      };
    }),
  saveAsSucceeded: (path, persistedMarkdown, modifiedAt, digest = null) =>
    set((state) => ({
      path,
      persistedMarkdown,
      persistedDigest: digest,
      modifiedAt,
      savingMarkdown: null,
      saveStatus: state.markdown === persistedMarkdown ? "clean" : "dirty",
      saveError: null,
      autosaveSuppressed: false,
      pendingExternal: null,
    })),
  cancelSaving: () =>
    set((state) => ({
      saveStatus: state.markdown === state.persistedMarkdown ? "clean" : "dirty",
      savingMarkdown: null,
    })),
  saveFailed: (saveError) => set({ saveStatus: "error", saveError, savingMarkdown: null }),
  applyExternalChange: (markdown, modifiedAt, digest = null) => {
    const state = get();
    if (markdown === state.persistedMarkdown || markdown === state.savingMarkdown) {
      return "ignored";
    }
    if (state.saveStatus === "clean") {
      set({
        markdown,
        persistedMarkdown: markdown,
        persistedDigest: digest,
        modifiedAt,
        savingMarkdown: null,
        pendingExternal: null,
        autosaveSuppressed: false,
      });
      return "reloaded";
    }

    set({ pendingExternal: { markdown, modifiedAt, digest } });
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
          persistedDigest: external.digest,
          modifiedAt: external.modifiedAt,
          savingMarkdown: null,
          saveStatus: "clean",
          saveError: null,
          pendingExternal: null,
          autosaveSuppressed: false,
        };
      }
      return {
        persistedMarkdown: external.markdown,
        persistedDigest: external.digest,
        modifiedAt: external.modifiedAt,
        savingMarkdown: null,
        saveStatus:
          state.markdown === external.markdown ? ("clean" as const) : ("dirty" as const),
        pendingExternal: null,
        autosaveSuppressed: true,
      };
    }),
}));
