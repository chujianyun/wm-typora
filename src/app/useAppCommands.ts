import { useCallback, useState } from "react";
import { useDocumentStore } from "../document/documentStore";
import type { NativeBridge } from "../native/types";
import { usePreferenceStore } from "../preferences/preferenceStore";
import { useWorkspaceStore } from "../workspace/workspaceStore";

type DeferredAction = () => void | Promise<void>;

function errorMessage(error: unknown) {
  if (typeof error === "object" && error && "message" in error) return String(error.message);
  return error instanceof Error ? error.message : String(error);
}

export function useAppCommands(bridge: NativeBridge) {
  const [deferredAction, setDeferredAction] = useState<DeferredAction | null>(null);

  const saveDocument = useCallback(async () => {
    const document = useDocumentStore.getState();
    document.startSaving();
    try {
      if (document.path) {
        const result = await bridge.writeFileAtomic(document.path, document.markdown);
        useDocumentStore.getState().saveSucceeded(result.modifiedAt);
        return true;
      }
      const result = await bridge.saveFileAs(document.markdown, "Untitled.md");
      if (!result) {
        useDocumentStore.getState().updateMarkdown(document.markdown);
        return false;
      }
      useDocumentStore.getState().saveAsSucceeded(result.path, result.modifiedAt);
      usePreferenceStore.getState().addRecentFile(result.path);
      return true;
    } catch (error) {
      useDocumentStore.getState().saveFailed(errorMessage(error));
      return false;
    }
  }, [bridge]);

  const protect = useCallback((action: DeferredAction) => {
    const status = useDocumentStore.getState().saveStatus;
    if (status === "dirty" || status === "saving" || status === "error") {
      setDeferredAction(() => action);
    } else {
      void action();
    }
  }, []);

  const newDocument = useCallback(() => {
    protect(() => useDocumentStore.getState().newDocument());
  }, [protect]);

  const openFile = useCallback(() => {
    protect(async () => {
      const file = await bridge.openFile();
      if (!file) return;
      useDocumentStore.getState().openDocument(file);
      usePreferenceStore.getState().addRecentFile(file.path);
    });
  }, [bridge, protect]);

  const openPath = useCallback((path: string) => {
    protect(async () => {
      const file = await bridge.readFile(path);
      useDocumentStore.getState().openDocument(file);
      usePreferenceStore.getState().addRecentFile(file.path);
    });
  }, [bridge, protect]);

  const openWorkspace = useCallback(async () => {
    const workspace = await bridge.openWorkspace();
    if (!workspace) return;
    useWorkspaceStore.getState().setWorkspace(workspace.path, workspace.entries);
    usePreferenceStore.getState().addRecentWorkspace(workspace.path);
  }, [bridge]);

  const discardAndContinue = useCallback(() => {
    const action = deferredAction;
    setDeferredAction(null);
    if (action) void action();
  }, [deferredAction]);

  const saveAndContinue = useCallback(async () => {
    const action = deferredAction;
    if (await saveDocument()) {
      setDeferredAction(null);
      if (action) await action();
    }
  }, [deferredAction, saveDocument]);

  return {
    confirmationOpen: deferredAction !== null,
    newDocument,
    openFile,
    openPath,
    openWorkspace,
    saveDocument,
    discardAndContinue,
    saveAndContinue,
    cancelDeferred: () => setDeferredAction(null),
  };
}
