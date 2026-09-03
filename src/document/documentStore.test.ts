import { useDocumentStore } from "./documentStore";

describe("document store", () => {
  beforeEach(() => {
    useDocumentStore.getState().newDocument();
  });

  it("marks a document dirty only after its Markdown changes", () => {
    const store = useDocumentStore.getState();
    expect(store.path).toBeNull();
    expect(store.saveStatus).toBe("clean");

    store.updateMarkdown("# First note");

    expect(useDocumentStore.getState()).toMatchObject({
      markdown: "# First note",
      persistedMarkdown: "",
      saveStatus: "dirty",
    });
  });

  it("updates the disk baseline only after a successful save", () => {
    const store = useDocumentStore.getState();
    store.openDocument({ path: "/notes/a.md", markdown: "old", modifiedAt: 10 });
    store.updateMarkdown("new");
    store.startSaving();

    expect(useDocumentStore.getState().persistedMarkdown).toBe("old");
    expect(useDocumentStore.getState().saveStatus).toBe("saving");

    useDocumentStore.getState().saveSucceeded(20);
    expect(useDocumentStore.getState()).toMatchObject({
      persistedMarkdown: "new",
      modifiedAt: 20,
      saveStatus: "clean",
      saveError: null,
    });
  });

  it("keeps edited Markdown recoverable when saving fails", () => {
    const store = useDocumentStore.getState();
    store.openDocument({ path: "/notes/a.md", markdown: "old", modifiedAt: 10 });
    store.updateMarkdown("unsaved");
    store.startSaving();
    useDocumentStore.getState().saveFailed("Disk is full");

    expect(useDocumentStore.getState()).toMatchObject({
      markdown: "unsaved",
      persistedMarkdown: "old",
      saveStatus: "error",
      saveError: "Disk is full",
    });
  });

  it("reloads clean external changes but asks before replacing dirty content", () => {
    const store = useDocumentStore.getState();
    store.openDocument({ path: "/notes/a.md", markdown: "disk v1", modifiedAt: 10 });

    expect(store.applyExternalChange("disk v2", 20)).toBe("reloaded");
    expect(useDocumentStore.getState().markdown).toBe("disk v2");

    useDocumentStore.getState().updateMarkdown("local edit");
    expect(useDocumentStore.getState().applyExternalChange("disk v3", 30)).toBe(
      "conflict",
    );
    expect(useDocumentStore.getState().markdown).toBe("local edit");

    useDocumentStore.getState().resolveExternalConflict("keep");
    expect(useDocumentStore.getState()).toMatchObject({
      markdown: "local edit",
      persistedMarkdown: "disk v3",
      modifiedAt: 30,
      saveStatus: "dirty",
      pendingExternal: null,
    });
  });
});
