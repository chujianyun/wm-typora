import { act, renderHook, waitFor } from "@testing-library/react";
import { useDocumentStore } from "../document/documentStore";
import { listRecoveryDrafts, upsertRecoveryDraft } from "../document/recovery";
import { createMemoryNativeBridge } from "../native/browserBridge";
import type { FileSnapshot, FileWriteResult } from "../native/types";
import { useAppCommands } from "./useAppCommands";

function deferredWrite() {
  let resolve!: (value: FileWriteResult) => void;
  const promise = new Promise<FileWriteResult>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function deferredFile() {
  let resolve!: (value: FileSnapshot | null) => void;
  const promise = new Promise<FileSnapshot | null>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("useAppCommands save coordination", () => {
  beforeEach(() => {
    localStorage.clear();
    useDocumentStore.getState().newDocument();
  });

  it("serializes overlapping saves so the newest requested snapshot wins", async () => {
    const firstWrite = deferredWrite();
    const bridge = createMemoryNativeBridge();
    const writeFileAtomic = vi
      .fn()
      .mockImplementationOnce(() => firstWrite.promise)
      .mockResolvedValueOnce({ path: "/notes/a.md", modifiedAt: 30, digest: "new" });
    const { result } = renderHook(() => useAppCommands({ ...bridge, writeFileAtomic }));
    useDocumentStore.getState().openDocument({
      path: "/notes/a.md",
      markdown: "disk",
      modifiedAt: 10,
    });
    useDocumentStore.getState().updateMarkdown("first snapshot");

    let firstSave!: Promise<boolean>;
    act(() => {
      firstSave = result.current.saveDocument();
    });
    await waitFor(() => expect(writeFileAtomic).toHaveBeenCalledTimes(1));

    useDocumentStore.getState().updateMarkdown("newest snapshot");
    let secondSave!: Promise<boolean>;
    act(() => {
      secondSave = result.current.saveDocument();
    });
    expect(writeFileAtomic).toHaveBeenCalledTimes(1);

    firstWrite.resolve({ path: "/notes/a.md", modifiedAt: 20, digest: "old" });
    await waitFor(() => expect(writeFileAtomic).toHaveBeenCalledTimes(2));
    await Promise.all([firstSave, secondSave]);

    expect(writeFileAtomic.mock.calls.map((call) => call[1])).toEqual([
      "first snapshot",
      "newest snapshot",
    ]);
    expect(useDocumentStore.getState()).toMatchObject({
      markdown: "newest snapshot",
      persistedMarkdown: "newest snapshot",
      saveStatus: "clean",
    });
  });

  it("does not continue a deferred destructive action when edits arrive during save", async () => {
    const pendingWrite = deferredWrite();
    const bridge = createMemoryNativeBridge();
    const writeFileAtomic = vi.fn(() => pendingWrite.promise);
    const { result } = renderHook(() => useAppCommands({ ...bridge, writeFileAtomic }));
    const action = vi.fn();
    useDocumentStore.getState().openDocument({
      path: "/notes/a.md",
      markdown: "disk",
      modifiedAt: 10,
    });
    useDocumentStore.getState().updateMarkdown("snapshot being saved");
    act(() => result.current.requestAction(action));

    let saveAndContinue!: Promise<void>;
    act(() => {
      saveAndContinue = result.current.saveAndContinue();
    });
    await waitFor(() => expect(writeFileAtomic).toHaveBeenCalledTimes(1));
    useDocumentStore.getState().updateMarkdown("newer local edit");
    pendingWrite.resolve({ path: "/notes/a.md", modifiedAt: 20, digest: "saved" });
    await saveAndContinue;

    expect(action).not.toHaveBeenCalled();
    expect(result.current.confirmationOpen).toBe(true);
    expect(useDocumentStore.getState().saveStatus).toBe("dirty");
  });

  it("deletes the discarded document recovery draft before continuing", async () => {
    const bridge = createMemoryNativeBridge();
    const { result } = renderHook(() => useAppCommands(bridge));
    const action = vi.fn();
    useDocumentStore.getState().updateMarkdown("discard me");
    const { recoveryId } = useDocumentStore.getState();
    upsertRecoveryDraft({ recoveryId, path: null, markdown: "discard me", savedAt: 1 });

    act(() => result.current.requestAction(action));
    act(() => result.current.discardAndContinue());

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(listRecoveryDrafts()).toEqual([]);
  });

  it("surfaces a typed open error without replacing the current document", async () => {
    const bridge = createMemoryNativeBridge();
    bridge.openFile = vi.fn().mockRejectedValue({
      code: "io_error",
      message: "Permission denied",
      path: "/notes/private.md",
    });
    useDocumentStore.getState().updateMarkdown("keep this");
    useDocumentStore.getState().saveSucceeded("keep this", 1, "keep-digest", true);
    const { result } = renderHook(() => useAppCommands(bridge));

    act(() => result.current.openFile());

    await waitFor(() =>
      expect(result.current.commandError).toContain("Permission denied"),
    );
    expect(result.current.commandError).toContain("/notes/private.md");
    expect(useDocumentStore.getState().markdown).toBe("keep this");
  });

  it("rechecks unsaved edits before committing an async open result", async () => {
    const pendingFile = deferredFile();
    const bridge = createMemoryNativeBridge();
    bridge.openFile = vi.fn(() => pendingFile.promise);
    useDocumentStore.getState().openDocument({
      path: "/notes/current.md",
      markdown: "disk",
      modifiedAt: 1,
      digest: "disk-digest",
    });
    const { result } = renderHook(() => useAppCommands(bridge));

    act(() => result.current.openFile());
    useDocumentStore.getState().updateMarkdown("edit made while dialog was open");
    pendingFile.resolve({
      path: "/notes/next.md",
      name: "next.md",
      markdown: "next file",
      modifiedAt: 2,
      digest: "next-digest",
    });

    await waitFor(() => expect(result.current.confirmationOpen).toBe(true));
    expect(useDocumentStore.getState().markdown).toBe("edit made while dialog was open");

    act(() => result.current.discardAndContinue());
    await waitFor(() => expect(useDocumentStore.getState().path).toBe("/notes/next.md"));
  });

  it("ignores an older open request that finishes after a newer request starts", async () => {
    const first = deferredFile();
    const second = deferredFile();
    const bridge = createMemoryNativeBridge();
    bridge.openFile = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { result } = renderHook(() => useAppCommands(bridge));

    act(() => result.current.openFile());
    act(() => result.current.openFile());
    first.resolve({
      path: "/notes/old-request.md",
      name: "old-request.md",
      markdown: "old request",
      modifiedAt: 1,
      digest: "old-request-digest",
    });
    await act(async () => Promise.resolve());
    expect(useDocumentStore.getState().path).toBeNull();

    second.resolve({
      path: "/notes/latest-request.md",
      name: "latest-request.md",
      markdown: "latest request",
      modifiedAt: 2,
      digest: "latest-request-digest",
    });
    await waitFor(() =>
      expect(useDocumentStore.getState().path).toBe("/notes/latest-request.md"),
    );
  });

  it("keeps a deferred newer open request ahead of an older in-flight result", async () => {
    const first = deferredFile();
    const bridge = createMemoryNativeBridge({ files: { "/notes/newer.md": "newer" } });
    bridge.openFile = vi.fn(() => first.promise);
    const { result } = renderHook(() => useAppCommands(bridge));

    act(() => result.current.openFile());
    useDocumentStore.getState().updateMarkdown("local edit");
    act(() => result.current.openPath("/notes/newer.md"));
    first.resolve({
      path: "/notes/older.md",
      name: "older.md",
      markdown: "older",
      modifiedAt: 1,
      digest: "older-digest",
    });

    await act(async () => Promise.resolve());
    expect(useDocumentStore.getState().markdown).toBe("local edit");
    expect(result.current.confirmationOpen).toBe(true);

    act(() => result.current.discardAndContinue());
    await waitFor(() => expect(useDocumentStore.getState().path).toBe("/notes/newer.md"));
  });

  it("turns an optimistic save rejection into an external-change conflict", async () => {
    const bridge = createMemoryNativeBridge();
    bridge.writeFileAtomic = vi.fn().mockRejectedValue({
      code: "external_change",
      message: "File changed on disk",
      path: "/notes/a.md",
    });
    bridge.readFile = vi.fn().mockResolvedValue({
      path: "/notes/a.md",
      name: "a.md",
      markdown: "external edit",
      modifiedAt: 20,
      digest: "external-digest",
    });
    useDocumentStore.getState().openDocument({
      path: "/notes/a.md",
      markdown: "disk",
      modifiedAt: 10,
      digest: "disk-digest",
    });
    useDocumentStore.getState().updateMarkdown("local edit");
    const { result } = renderHook(() => useAppCommands(bridge));

    await act(() => result.current.saveDocument());

    expect(bridge.writeFileAtomic).toHaveBeenCalledWith(
      "/notes/a.md",
      "local edit",
      "disk-digest",
    );
    expect(useDocumentStore.getState()).toMatchObject({
      markdown: "local edit",
      pendingExternal: { markdown: "external edit", modifiedAt: 20 },
    });
  });

  it("does not apply a stale conflict-read failure to a new document session", async () => {
    let rejectRead!: (error: unknown) => void;
    const pendingRead = new Promise<FileSnapshot>((_resolve, reject) => {
      rejectRead = reject;
    });
    const bridge = createMemoryNativeBridge();
    bridge.writeFileAtomic = vi.fn().mockRejectedValue({
      code: "external_change",
      message: "File changed on disk",
      path: "/notes/a.md",
    });
    bridge.readFile = vi.fn(() => pendingRead);
    useDocumentStore.getState().openDocument({
      path: "/notes/a.md",
      markdown: "disk",
      modifiedAt: 10,
      digest: "disk-digest",
    });
    useDocumentStore.getState().updateMarkdown("local edit");
    const { result } = renderHook(() => useAppCommands(bridge));

    let saving!: Promise<boolean>;
    act(() => {
      saving = result.current.saveDocument();
    });
    await waitFor(() => expect(bridge.readFile).toHaveBeenCalledOnce());
    useDocumentStore.getState().newDocument();
    rejectRead(new Error("old read failed"));
    await saving;

    expect(useDocumentStore.getState()).toMatchObject({
      path: null,
      markdown: "",
      saveStatus: "clean",
      saveError: null,
    });
  });

  it("finishes saving when another writer already produced the requested snapshot", async () => {
    const bridge = createMemoryNativeBridge();
    bridge.writeFileAtomic = vi.fn().mockRejectedValue({
      code: "external_change",
      message: "File changed on disk",
      path: "/notes/a.md",
    });
    bridge.readFile = vi.fn().mockResolvedValue({
      path: "/notes/a.md",
      name: "a.md",
      markdown: "same edit",
      modifiedAt: 20,
      digest: "same-digest",
    });
    useDocumentStore.getState().openDocument({
      path: "/notes/a.md",
      markdown: "disk",
      modifiedAt: 10,
      digest: "disk-digest",
    });
    useDocumentStore.getState().updateMarkdown("same edit");
    const { result } = renderHook(() => useAppCommands(bridge));

    let saved!: boolean;
    await act(async () => {
      saved = await result.current.saveDocument();
    });

    expect(saved).toBe(true);
    expect(useDocumentStore.getState()).toMatchObject({
      persistedMarkdown: "same edit",
      persistedDigest: "same-digest",
      saveStatus: "clean",
      pendingExternal: null,
    });
  });

  it("continues a deferred action when the external file already matches the save", async () => {
    const bridge = createMemoryNativeBridge();
    bridge.writeFileAtomic = vi.fn().mockRejectedValue({
      code: "external_change",
      message: "File changed on disk",
      path: "/notes/a.md",
    });
    bridge.readFile = vi.fn().mockResolvedValue({
      path: "/notes/a.md",
      name: "a.md",
      markdown: "same edit",
      modifiedAt: 20,
      digest: "same-digest",
    });
    useDocumentStore.getState().openDocument({
      path: "/notes/a.md",
      markdown: "disk",
      modifiedAt: 10,
      digest: "disk-digest",
    });
    useDocumentStore.getState().updateMarkdown("same edit");
    const action = vi.fn();
    const { result } = renderHook(() => useAppCommands(bridge));
    act(() => result.current.requestAction(action));

    await act(() => result.current.saveAndContinue());

    expect(action).toHaveBeenCalledOnce();
    expect(result.current.confirmationOpen).toBe(false);
    expect(useDocumentStore.getState().saveStatus).toBe("clean");
  });

  it("returns a cancelled Save As operation to a recoverable dirty state", async () => {
    const bridge = createMemoryNativeBridge();
    bridge.saveFileAs = vi.fn().mockResolvedValue(null);
    useDocumentStore.getState().updateMarkdown("unsaved note");
    const { result } = renderHook(() => useAppCommands(bridge));

    await act(() => result.current.saveAsDocument());

    expect(useDocumentStore.getState()).toMatchObject({
      markdown: "unsaved note",
      saveStatus: "dirty",
      savingMarkdown: null,
    });
  });
});
