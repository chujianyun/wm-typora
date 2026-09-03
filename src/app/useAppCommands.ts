import { useCallback, useRef, useState } from "react";
import { useDocumentStore } from "../document/documentStore";
import { removeRecoveryDraft } from "../document/recovery";
import type { NativeBridge } from "../native/types";
import { usePreferenceStore } from "../preferences/preferenceStore";
import { useWorkspaceStore } from "../workspace/workspaceStore";

type DeferredAction = () => void | Promise<void>;

interface DeferredRequest {
  action: DeferredAction;
  recoveryId: string;
}

function errorMessage(error: unknown) {
  if (typeof error === "object" && error && "message" in error) {
    const path = "path" in error && typeof error.path === "string" ? ` · ${error.path}` : "";
    return `${String(error.message)}${path}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error
    ? String(error.code)
    : null;
}

export function useAppCommands(bridge: NativeBridge) {
  const [deferredRequest, setDeferredRequest] = useState<DeferredRequest | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const openRequest = useRef(0);
  const reportError = useCallback((error: unknown) => setCommandError(errorMessage(error)), []);

  const enqueueSave = useCallback(<T,>(operation: () => Promise<T>) => {
    const pending = saveQueue.current.then(operation, operation);
    saveQueue.current = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }, []);

  const saveDocument = useCallback((explicit = true) => {
    const request = useDocumentStore.getState();
    const { markdown, recoveryId } = request;
    return enqueueSave(async () => {
      const document = useDocumentStore.getState();
      if (document.recoveryId !== recoveryId) return false;
      document.startSaving(markdown);
      try {
        if (document.path) {
          const result = await bridge.writeFileAtomic(
            document.path,
            markdown,
            document.persistedDigest,
          );
          const current = useDocumentStore.getState();
          if (current.recoveryId === recoveryId) {
            current.saveSucceeded(markdown, result.modifiedAt, result.digest, explicit);
          }
          return true;
        }
        const result = await bridge.saveFileAs(markdown, "Untitled.md");
        const current = useDocumentStore.getState();
        if (current.recoveryId !== recoveryId) return false;
        if (!result) {
          current.cancelSaving();
          return false;
        }
        current.saveAsSucceeded(result.path, markdown, result.modifiedAt, result.digest);
        usePreferenceStore.getState().addRecentFile(result.path);
        return true;
      } catch (error) {
        const current = useDocumentStore.getState();
        if (current.recoveryId === recoveryId && errorCode(error) === "external_change" && document.path) {
          try {
            const snapshot = await bridge.readFile(document.path);
            const latest = useDocumentStore.getState();
            if (latest.recoveryId === recoveryId) {
              const outcome = latest.applyExternalChange(
                snapshot.markdown,
                snapshot.modifiedAt,
                snapshot.digest,
              );
              if (outcome === "ignored") {
                if (snapshot.markdown === markdown) {
                  latest.saveSucceeded(markdown, snapshot.modifiedAt, snapshot.digest, explicit);
                  return true;
                } else {
                  latest.saveFailed(errorMessage(error));
                }
              }
            }
          } catch (readError) {
            const latest = useDocumentStore.getState();
            if (latest.recoveryId === recoveryId) latest.saveFailed(errorMessage(readError));
          }
        } else if (current.recoveryId === recoveryId) {
          current.saveFailed(errorMessage(error));
        }
        return false;
      }
    });
  }, [bridge, enqueueSave]);

  const saveAsDocument = useCallback(() => {
    const request = useDocumentStore.getState();
    const { markdown, recoveryId } = request;
    return enqueueSave(async () => {
      const document = useDocumentStore.getState();
      if (document.recoveryId !== recoveryId) return false;
      const suggestedName = document.path?.split(/[\\/]/).at(-1) ?? "Untitled.md";
      document.startSaving(markdown);
      try {
        const result = await bridge.saveFileAs(markdown, suggestedName);
        const current = useDocumentStore.getState();
        if (current.recoveryId !== recoveryId) return false;
        if (!result) {
          current.cancelSaving();
          return false;
        }
        current.saveAsSucceeded(result.path, markdown, result.modifiedAt, result.digest);
        usePreferenceStore.getState().addRecentFile(result.path);
        return true;
      } catch (error) {
        const current = useDocumentStore.getState();
        if (current.recoveryId === recoveryId) current.saveFailed(errorMessage(error));
        return false;
      }
    });
  }, [bridge, enqueueSave]);

  const protect = useCallback((action: DeferredAction) => {
    const status = useDocumentStore.getState().saveStatus;
    if (status === "dirty" || status === "saving" || status === "error") {
      setDeferredRequest({ action, recoveryId: useDocumentStore.getState().recoveryId });
    } else {
      void action();
    }
  }, []);

  const newDocument = useCallback(() => {
    protect(() => useDocumentStore.getState().newDocument());
  }, [protect]);

  const openFile = useCallback(() => {
    const requestId = ++openRequest.current;
    protect(async () => {
      const startingDocument = useDocumentStore.getState();
      const recoveryId = startingDocument.recoveryId;
      const startingMarkdown = startingDocument.markdown;
      try {
        setCommandError(null);
        const file = await bridge.openFile();
        if (!file) return;
        const current = useDocumentStore.getState();
        if (requestId !== openRequest.current) return;
        if (current.recoveryId !== recoveryId) {
          reportError(new Error("当前文档已变化，已取消打开文件"));
          return;
        }
        const commit = () => {
          if (
            requestId !== openRequest.current ||
            useDocumentStore.getState().recoveryId !== recoveryId
          ) return;
          useDocumentStore.getState().openDocument(file);
          usePreferenceStore.getState().addRecentFile(file.path);
        };
        if (current.markdown === startingMarkdown) commit();
        else protect(commit);
      } catch (error) {
        if (
          requestId !== openRequest.current ||
          useDocumentStore.getState().recoveryId !== recoveryId
        ) return;
        reportError(error);
      }
    });
  }, [bridge, protect, reportError]);

  const openPath = useCallback((path: string) => {
    const requestId = ++openRequest.current;
    protect(async () => {
      const startingDocument = useDocumentStore.getState();
      const recoveryId = startingDocument.recoveryId;
      const startingMarkdown = startingDocument.markdown;
      try {
        setCommandError(null);
        const file = await bridge.readFile(path);
        const current = useDocumentStore.getState();
        if (requestId !== openRequest.current) return;
        if (current.recoveryId !== recoveryId) {
          reportError(new Error("当前文档已变化，已取消打开文件"));
          return;
        }
        const commit = () => {
          if (
            requestId !== openRequest.current ||
            useDocumentStore.getState().recoveryId !== recoveryId
          ) return;
          useDocumentStore.getState().openDocument(file);
          usePreferenceStore.getState().addRecentFile(file.path);
        };
        if (current.markdown === startingMarkdown) commit();
        else protect(commit);
      } catch (error) {
        if (
          requestId !== openRequest.current ||
          useDocumentStore.getState().recoveryId !== recoveryId
        ) return;
        reportError(error);
      }
    });
  }, [bridge, protect, reportError]);

  const openWorkspace = useCallback(async () => {
    try {
      setCommandError(null);
      const workspace = await bridge.openWorkspace();
      if (!workspace) return;
      useWorkspaceStore.getState().setWorkspace(workspace.path, workspace.entries);
      usePreferenceStore.getState().addRecentWorkspace(workspace.path);
    } catch (error) {
      reportError(error);
    }
  }, [bridge, reportError]);

  const discardAndContinue = useCallback(() => {
    const request = deferredRequest;
    setDeferredRequest(null);
    if (request) {
      removeRecoveryDraft(request.recoveryId);
      void request.action();
    }
  }, [deferredRequest]);

  const saveAndContinue = useCallback(async () => {
    const request = deferredRequest;
    if (!request) return;
    if (await saveDocument()) {
      const current = useDocumentStore.getState();
      if (current.recoveryId === request.recoveryId && current.saveStatus === "clean") {
        setDeferredRequest(null);
        await request.action();
      }
    }
  }, [deferredRequest, saveDocument]);

  return {
    commandError,
    clearCommandError: () => setCommandError(null),
    reportError,
    confirmationOpen: deferredRequest !== null,
    newDocument,
    openFile,
    openPath,
    openWorkspace,
    saveDocument,
    saveAsDocument,
    requestAction: protect,
    discardAndContinue,
    saveAndContinue,
    cancelDeferred: () => setDeferredRequest(null),
  };
}
