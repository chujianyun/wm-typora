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

    useDocumentStore.getState().saveSucceeded("new", 20);
    expect(useDocumentStore.getState()).toMatchObject({
      persistedMarkdown: "new",
      modifiedAt: 20,
      saveStatus: "clean",
      saveError: null,
    });
  });

  it("stays dirty when the document changes while an older snapshot is saving", () => {
    const store = useDocumentStore.getState();
    store.openDocument({ path: "/notes/a.md", markdown: "disk", modifiedAt: 10 });
    store.updateMarkdown("snapshot being saved");
    store.startSaving();
    store.updateMarkdown("newer local edit");

    useDocumentStore.getState().saveSucceeded("snapshot being saved", 20);

    expect(useDocumentStore.getState()).toMatchObject({
      markdown: "newer local edit",
      persistedMarkdown: "snapshot being saved",
      saveStatus: "dirty",
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

  it("adopts the selected path after saving an unnamed document", () => {
    const store = useDocumentStore.getState();
    store.updateMarkdown("new note");
    store.startSaving();
    store.saveAsSucceeded("/notes/new.md", "new note", 25);

    expect(useDocumentStore.getState()).toMatchObject({
      path: "/notes/new.md",
      markdown: "new note",
      persistedMarkdown: "new note",
      modifiedAt: 25,
      saveStatus: "clean",
    });
  });

  it("keeps post-dialog edits dirty after Save As writes an older snapshot", () => {
    const store = useDocumentStore.getState();
    store.updateMarkdown("snapshot being saved");
    store.startSaving();
    store.updateMarkdown("newer local edit");

    store.saveAsSucceeded("/notes/new.md", "snapshot being saved", 25);

    expect(useDocumentStore.getState()).toMatchObject({
      path: "/notes/new.md",
      markdown: "newer local edit",
      persistedMarkdown: "snapshot being saved",
      saveStatus: "dirty",
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
      autosaveSuppressed: true,
      pendingExternal: null,
    });

    useDocumentStore.getState().startSaving();
    useDocumentStore.getState().saveSucceeded("local edit", 40, "local-digest", true);
    expect(useDocumentStore.getState()).toMatchObject({
      saveStatus: "clean",
      autosaveSuppressed: false,
    });
  });

  it("ignores a watcher echo of the snapshot currently being saved", () => {
    const store = useDocumentStore.getState();
    store.openDocument({
      path: "/notes/a.md",
      markdown: "disk",
      modifiedAt: 10,
      digest: "disk-digest",
    });
    store.updateMarkdown("local edit");
    store.startSaving("local edit");

    expect(store.applyExternalChange("local edit", 20)).toBe("ignored");
    expect(useDocumentStore.getState()).toMatchObject({
      saveStatus: "saving",
      pendingExternal: null,
    });
  });

  it("keeps a real external conflict protected when the in-flight save completes", () => {
    const store = useDocumentStore.getState();
    store.openDocument({
      path: "/notes/a.md",
      markdown: "disk",
      modifiedAt: 10,
      digest: "disk-digest",
    });
    store.updateMarkdown("local edit");
    store.startSaving("local edit");
    expect(store.applyExternalChange("external edit", 20, "external-digest")).toBe("conflict");

    store.saveSucceeded("local edit", 15, "local-digest");

    expect(useDocumentStore.getState()).toMatchObject({
      markdown: "local edit",
      saveStatus: "dirty",
      autosaveSuppressed: true,
      pendingExternal: {
        markdown: "external edit",
        modifiedAt: 20,
        digest: "external-digest",
      },
    });
  });
});
