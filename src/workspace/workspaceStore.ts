import { create } from "zustand";
import type { WorkspaceEntry } from "../native/types";

export type SidebarTab = "files" | "outline";

interface WorkspaceStore {
  path: string | null;
  entries: WorkspaceEntry[];
  activeTab: SidebarTab;
  expandedPaths: Set<string>;
  setWorkspace(path: string, entries: WorkspaceEntry[]): void;
  setActiveTab(tab: SidebarTab): void;
  toggleExpanded(path: string): void;
  clearWorkspace(): void;
}

export const useWorkspaceStore = create<WorkspaceStore>()((set) => ({
  path: null,
  entries: [],
  activeTab: "files",
  expandedPaths: new Set<string>(),
  setWorkspace: (path, entries) =>
    set({
      path,
      entries,
      activeTab: "files",
      expandedPaths: new Set(entries.filter((entry) => entry.kind === "directory").map((entry) => entry.path)),
    }),
  setActiveTab: (activeTab) => set({ activeTab }),
  toggleExpanded: (path) =>
    set((state) => {
      const expandedPaths = new Set(state.expandedPaths);
      if (expandedPaths.has(path)) expandedPaths.delete(path);
      else expandedPaths.add(path);
      return { expandedPaths };
    }),
  clearWorkspace: () => set({ path: null, entries: [], expandedPaths: new Set() }),
}));
