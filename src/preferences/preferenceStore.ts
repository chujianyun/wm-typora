import { isTauri } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { create } from "zustand";
import type { EditorMode } from "../editor/EditorPane";

export type ThemePreference = "system" | "light" | "dark";

interface PreferenceValues {
  theme: ThemePreference;
  editorMode: EditorMode;
  sidebarOpen: boolean;
  focusMode: boolean;
  typewriterMode: boolean;
  recentFiles: string[];
  recentWorkspaces: string[];
}

interface PreferenceStore extends PreferenceValues {
  hydrate(values: Partial<PreferenceValues>): void;
  setTheme(theme: ThemePreference): void;
  setEditorMode(editorMode: EditorMode): void;
  toggleSidebar(): void;
  toggleFocusMode(): void;
  toggleTypewriterMode(): void;
  addRecentFile(path: string): void;
  addRecentWorkspace(path: string): void;
}

const defaults: PreferenceValues = {
  theme: "system",
  editorMode: "visual",
  sidebarOpen: true,
  focusMode: false,
  typewriterMode: false,
  recentFiles: [],
  recentWorkspaces: [],
};

function recent(path: string, values: string[]) {
  return [path, ...values.filter((value) => value !== path)].slice(0, 10);
}

export const usePreferenceStore = create<PreferenceStore>()((set) => ({
  ...defaults,
  hydrate: (values) => set((state) => ({ ...state, ...values })),
  setTheme: (theme) => set({ theme }),
  setEditorMode: (editorMode) => set({ editorMode }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  toggleFocusMode: () => set((state) => ({ focusMode: !state.focusMode })),
  toggleTypewriterMode: () => set((state) => ({ typewriterMode: !state.typewriterMode })),
  addRecentFile: (path) => set((state) => ({ recentFiles: recent(path, state.recentFiles) })),
  addRecentWorkspace: (path) =>
    set((state) => ({ recentWorkspaces: recent(path, state.recentWorkspaces) })),
}));

function valuesFrom(state: PreferenceStore): PreferenceValues {
  return {
    theme: state.theme,
    editorMode: state.editorMode,
    sidebarOpen: state.sidebarOpen,
    focusMode: state.focusMode,
    typewriterMode: state.typewriterMode,
    recentFiles: state.recentFiles,
    recentWorkspaces: state.recentWorkspaces,
  };
}

let hydrated = false;

export async function initializePreferences() {
  if (hydrated) return;
  hydrated = true;
  try {
    if (isTauri()) {
      const store = await load("preferences.json", { autoSave: 100 });
      const saved = await store.get<PreferenceValues>("preferences");
      if (saved) usePreferenceStore.getState().hydrate(saved);
      usePreferenceStore.subscribe((state) => {
        void store.set("preferences", valuesFrom(state));
      });
    } else {
      const saved = localStorage.getItem("wtypora.preferences.v1");
      if (saved) usePreferenceStore.getState().hydrate(JSON.parse(saved));
      usePreferenceStore.subscribe((state) => {
        localStorage.setItem("wtypora.preferences.v1", JSON.stringify(valuesFrom(state)));
      });
    }
  } catch {
    usePreferenceStore.getState().hydrate(defaults);
  }
}
