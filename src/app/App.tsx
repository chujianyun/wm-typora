import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ExternalConflictDialog } from "../components/ExternalConflictDialog";
import { FindPanel } from "../components/FindPanel";
import { RecoveryDialog } from "../components/RecoveryDialog";
import { Sidebar } from "../components/Sidebar";
import { StatusBar } from "../components/StatusBar";
import { TitleBar } from "../components/TitleBar";
import { scheduleAutosave } from "../document/autosave";
import { useDocumentStore } from "../document/documentStore";
import {
  listRecoveryDrafts,
  removeRecoveryDraft,
  upsertRecoveryDraft,
  type RecoveryDraft,
} from "../document/recovery";
import { calculateStatistics } from "../document/statistics";
import type { EditorAdapter } from "../editor/EditorAdapter";
import { EditorPane } from "../editor/EditorPane";
import {
  markdownImageAlt,
  markdownImageUrl,
  resolveImageFilePath,
} from "../editor/imageUrl";
import { buildHtmlDocument } from "../export/buildHtml";
import { printHtmlDocument } from "../export/print";
import { nativeBridge } from "../native/nativeBridge";
import type { NativeBridge } from "../native/types";
import { initializePreferences, usePreferenceStore } from "../preferences/preferenceStore";
import { buildOutline } from "../workspace/outline";
import type { OutlineItem } from "../workspace/outline";
import { useWorkspaceStore } from "../workspace/workspaceStore";
import { useAppCommands } from "./useAppCommands";

interface AppProps {
  bridge?: NativeBridge;
}

function fileName(path: string | null) {
  return path?.split(/[\\/]/).at(-1) ?? "Untitled";
}

export function App({ bridge = nativeBridge }: AppProps) {
  const documentState = useDocumentStore();
  const preferences = usePreferenceStore();
  const workspace = useWorkspaceStore();
  const commands = useAppCommands(bridge);
  const {
    newDocument,
    openFile,
    openPath,
    openWorkspace,
    reportError,
    requestAction,
    saveAsDocument,
    saveDocument,
  } = commands;
  const {
    editorMode,
    setEditorMode,
    toggleFocusMode,
    toggleSidebar,
    toggleTypewriterMode,
  } = preferences;
  const editorRef = useRef<EditorAdapter | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [findOpen, setFindOpen] = useState(false);
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [recoveryDraft, setRecoveryDraft] = useState<RecoveryDraft | null>(
    () => listRecoveryDrafts().at(-1) ?? null,
  );
  const autosave = useMemo(
    () =>
      scheduleAutosave(async () => {
        await saveDocument(false);
      }),
    [saveDocument],
  );

  const statistics = useMemo(
    () => calculateStatistics(documentState.markdown),
    [documentState.markdown],
  );
  const outline = useMemo(() => buildOutline(documentState.markdown), [documentState.markdown]);
  const activeTheme =
    preferences.theme === "system"
      ? systemDark ? "dark" : "light"
      : preferences.theme;
  const exportName = `${fileName(documentState.path).replace(/\.[^.]+$/, "")}.html`;
  const resolveVisualImageUrl = useCallback(async (url: string) => {
    const documentPath = documentState.path;
    const imagePath = resolveImageFilePath(url, documentPath);
    if (!documentPath || !imagePath || !isTauri()) return url;
    const allowedPath = await bridge.resolveImagePath(documentPath, imagePath);
    return convertFileSrc(allowedPath);
  }, [bridge, documentState.path]);
  const buildExport = useCallback(
    () =>
      buildHtmlDocument(documentState.markdown, {
        title: fileName(documentState.path),
        theme: activeTheme,
        sourcePath: documentState.path,
      }),
    [activeTheme, documentState.markdown, documentState.path],
  );
  const buildPrint = useCallback(
    () =>
      buildHtmlDocument(documentState.markdown, {
        title: fileName(documentState.path),
        theme: activeTheme,
        resolveImageUrl: resolveVisualImageUrl,
      }),
    [activeTheme, documentState.markdown, documentState.path, resolveVisualImageUrl],
  );
  const buildExportRef = useRef(buildExport);
  const buildPrintRef = useRef(buildPrint);
  const exportNameRef = useRef(exportName);
  const editorModeRef = useRef(editorMode);
  useEffect(() => {
    buildExportRef.current = buildExport;
    buildPrintRef.current = buildPrint;
    exportNameRef.current = exportName;
    editorModeRef.current = editorMode;
  }, [buildExport, buildPrint, editorMode, exportName]);
  const executeCommand = useCallback((command: string) => {
    switch (command) {
      case "new-document": newDocument(); break;
      case "open-file": openFile(); break;
      case "open-workspace": void openWorkspace(); break;
      case "save-document": void saveDocument(); break;
      case "save-as": void saveAsDocument(); break;
      case "find": setFindOpen(true); break;
      case "toggle-sidebar": toggleSidebar(); break;
      case "toggle-source":
        setEditorMode(editorModeRef.current === "visual" ? "source" : "visual");
        break;
      case "toggle-focus": toggleFocusMode(); break;
      case "toggle-typewriter": toggleTypewriterMode(); break;
      case "export-html": {
        const build = buildExportRef.current;
        const name = exportNameRef.current;
        void build()
          .then((html) => bridge.exportHtml(html, name))
          .catch(reportError);
        break;
      }
      case "print-document":
        void buildPrintRef.current().then(printHtmlDocument).catch(reportError);
        break;
      case "quit-application":
        if (isTauri()) void getCurrentWindow().close().catch(reportError);
        break;
    }
  }, [
    bridge,
    newDocument,
    openFile,
    openWorkspace,
    reportError,
    saveAsDocument,
    saveDocument,
    setEditorMode,
    toggleFocusMode,
    toggleSidebar,
    toggleTypewriterMode,
  ]);

  useEffect(() => {
    void initializePreferences().catch(reportError);
    return () => autosave.cancel();
  }, [autosave, reportError]);

  useEffect(() => {
    let disposed = false;
    let stopWatching: (() => Promise<void>) | null = null;
    void bridge.watchOpenFiles(openPath, reportError).then((stop) => {
      if (disposed) void stop().catch(reportError);
      else stopWatching = stop;
    }).catch((error) => {
      if (!disposed) reportError(error);
    });
    return () => {
      disposed = true;
      if (stopWatching) void stopWatching().catch(reportError);
    };
  }, [bridge, openPath, reportError]);

  useEffect(() => {
    document.documentElement.dataset.theme = activeTheme;
  }, [activeTheme]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!documentState.path) return;
    const watchedPath = documentState.path;
    let disposed = false;
    let stopWatching: (() => Promise<void>) | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    void bridge.watchFile(documentState.path, () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        const beforeRead = useDocumentStore.getState();
        if (beforeRead.path !== watchedPath) return;
        const recoveryId = beforeRead.recoveryId;
        void bridge.readFile(watchedPath).then((snapshot) => {
          const current = useDocumentStore.getState();
          if (current.path !== watchedPath || current.recoveryId !== recoveryId) return;
          current.applyExternalChange(snapshot.markdown, snapshot.modifiedAt, snapshot.digest);
        }).catch((error) => {
          const current = useDocumentStore.getState();
          if (!disposed && current.path === watchedPath && current.recoveryId === recoveryId) {
            reportError(error);
          }
        });
      }, 80);
    }).then((stop) => {
      if (disposed) void stop().catch(reportError);
      else stopWatching = stop;
    }).catch(reportError);
    return () => {
      disposed = true;
      if (debounce) clearTimeout(debounce);
      if (stopWatching) void stopWatching().catch(reportError);
    };
  }, [bridge, documentState.path, reportError]);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void getCurrentWindow().onCloseRequested((event) => {
      const document = useDocumentStore.getState();
      if (document.saveStatus === "clean" && !document.pendingExternal) return;
      event.preventDefault();
      requestAction(() => getCurrentWindow().destroy());
    }).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    }).catch((error) => {
      if (!disposed) reportError(error);
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [reportError, requestAction]);

  useEffect(() => {
    const openExternalLink = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      event.preventDefault();
      if (!/^(https?:|mailto:)/i.test(href)) return;
      if (isTauri()) void openUrl(href).catch(reportError);
      else window.open(href, "_blank", "noopener,noreferrer");
    };
    document.addEventListener("click", openExternalLink);
    return () => document.removeEventListener("click", openExternalLink);
  }, [reportError]);

  useEffect(() => {
    if (documentState.saveStatus === "dirty" || documentState.saveStatus === "error") {
      upsertRecoveryDraft({
        recoveryId: documentState.recoveryId,
        path: documentState.path,
        markdown: documentState.markdown,
        savedAt: Date.now(),
      });
      autosave.schedule(Boolean(documentState.path) && !documentState.autosaveSuppressed);
    } else {
      autosave.cancel();
      if (documentState.saveStatus === "clean" && !documentState.pendingExternal) {
        removeRecoveryDraft(documentState.recoveryId);
      }
    }
  }, [
    documentState.markdown,
    documentState.path,
    documentState.recoveryId,
    documentState.saveStatus,
    documentState.autosaveSuppressed,
    documentState.pendingExternal,
    autosave,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier) return;
      const key = event.key.toLowerCase();
      if (key === "s" && event.shiftKey) {
        event.preventDefault();
        executeCommand("save-as");
      } else if (key === "s") {
        event.preventDefault();
        executeCommand("save-document");
      } else if (key === "o") {
        event.preventDefault();
        executeCommand("open-file");
      } else if (key === "n") {
        event.preventDefault();
        executeCommand("new-document");
      } else if (key === "f") {
        event.preventDefault();
        executeCommand("find");
      } else if (event.shiftKey && key === "m") {
        event.preventDefault();
        executeCommand("toggle-source");
      } else if (event.shiftKey && key === "l") {
        event.preventDefault();
        executeCommand("toggle-sidebar");
      } else if (event.shiftKey && key === "d") {
        event.preventDefault();
        executeCommand("toggle-focus");
      } else if (event.shiftKey && key === "t") {
        event.preventDefault();
        executeCommand("toggle-typewriter");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [executeCommand]);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void listen<string>("menu-command", (event) => executeCommand(event.payload))
      .then((dispose) => {
        if (disposed) dispose();
        else unlisten = dispose;
      })
      .catch((error) => {
        if (!disposed) reportError(error);
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [executeCommand, reportError]);

  const cycleTheme = () => {
    preferences.setTheme(
      preferences.theme === "system" ? "light" : preferences.theme === "light" ? "dark" : "system",
    );
  };

  const insertDroppedImages = async (files: FileList) => {
    let document = useDocumentStore.getState();
    const recoveryId = document.recoveryId;
    let path = document.path;
    if (!path) {
      if (!(await saveDocument())) return;
      document = useDocumentStore.getState();
      if (document.recoveryId !== recoveryId) return;
      path = document.path;
    }
    if (!path) return;

    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      if (useDocumentStore.getState().recoveryId !== recoveryId) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const beforeWrite = useDocumentStore.getState();
      if (beforeWrite.recoveryId !== recoveryId || beforeWrite.path !== path) return;
      const copied = await bridge.storeImage(
        file.name || `image-${Date.now()}.png`,
        bytes,
        path,
      );
      const current = useDocumentStore.getState();
      if (current.recoveryId !== recoveryId || current.path !== path) return;
      current.updateMarkdown(
        `${current.markdown}${current.markdown.endsWith("\n") || !current.markdown ? "" : "\n\n"}![${markdownImageAlt(file.name)}](${markdownImageUrl(copied.relativePath)})\n`,
      );
    }
  };

  const uploadImage = useCallback(async (file: File) => {
    let document = useDocumentStore.getState();
    const recoveryId = document.recoveryId;
    let path = document.path;
    if (!path) {
      if (!(await saveDocument())) throw new Error("保存文档后才能插入图片");
      document = useDocumentStore.getState();
      if (document.recoveryId !== recoveryId) throw new Error("文档已切换，已取消插入图片");
      path = document.path;
    }
    if (!path) throw new Error("保存文档后才能插入图片");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const beforeWrite = useDocumentStore.getState();
    if (beforeWrite.recoveryId !== recoveryId || beforeWrite.path !== path) {
      throw new Error("文档已切换，已取消插入图片");
    }
    const copied = await bridge.storeImage(
      file.name || `image-${Date.now()}.png`,
      bytes,
      path,
    );
    const current = useDocumentStore.getState();
    if (current.recoveryId !== recoveryId || current.path !== path) {
      throw new Error("文档已切换，已取消插入图片");
    }
    return markdownImageUrl(copied.relativePath);
  }, [bridge, saveDocument]);

  return (
    <main className="app-shell">
      <TitleBar
        fileName={fileName(documentState.path)}
        saveStatus={documentState.saveStatus}
        mode={preferences.editorMode}
        theme={preferences.theme}
        onNew={newDocument}
        onOpen={openFile}
        onOpenWorkspace={() => void openWorkspace()}
        onSave={() => void saveDocument()}
        onSaveAs={() => void saveAsDocument()}
        onToggleSidebar={toggleSidebar}
        onToggleMode={() =>
          setEditorMode(editorMode === "visual" ? "source" : "visual")
        }
        onToggleFind={() => setFindOpen((value) => !value)}
        onExportHtml={() => {
          executeCommand("export-html");
        }}
        onPrint={() => {
          executeCommand("print-document");
        }}
        onCycleTheme={cycleTheme}
      />

      <div className="workspace-layout" data-sidebar-open={preferences.sidebarOpen}>
        {preferences.sidebarOpen ? (
          <Sidebar
            activeTab={workspace.activeTab}
            entries={workspace.entries}
            outline={outline}
            expandedPaths={workspace.expandedPaths}
            activeOutlineId={activeOutlineId}
            onTab={workspace.setActiveTab}
            onOpenFile={commands.openPath}
            onToggleDirectory={workspace.toggleExpanded}
            onNavigate={(item: OutlineItem) => {
              setActiveOutlineId(item.id);
              editorRef.current?.navigateToLine(item.line);
            }}
          />
        ) : null}
        <div
          className="writing-area"
          onDrop={(event) => {
            event.preventDefault();
            if (preferences.editorMode === "source") {
              void insertDroppedImages(event.dataTransfer.files).catch(reportError);
            }
          }}
          onPaste={(event) => {
            if (preferences.editorMode === "source" && event.clipboardData.files.length) {
              event.preventDefault();
              void insertDroppedImages(event.clipboardData.files).catch(reportError);
            }
          }}
          onDragOver={(event) => event.preventDefault()}
          onKeyUp={() => setCursor(editorRef.current?.getCursor() ?? { line: 1, column: 1 })}
          onMouseUp={() => setCursor(editorRef.current?.getCursor() ?? { line: 1, column: 1 })}
        >
          {findOpen ? (
            <FindPanel
              countMatches={(query) => editorRef.current?.countMatches(query) ?? 0}
              onReplace={(query, replacement) =>
                editorRef.current?.replaceAllMatches(query, replacement)
              }
              onNavigate={(query, occurrence) =>
                editorRef.current?.revealMatch(query, occurrence)
              }
              onClose={() => setFindOpen(false)}
            />
          ) : null}
          {commands.commandError || documentState.saveError ? (
            <div className="error-banner" role="alert">
              {documentState.saveError ?? commands.commandError}
              {!documentState.saveError && commands.commandError ? (
                <button aria-label="关闭错误提示" onClick={commands.clearCommandError}>×</button>
              ) : null}
            </div>
          ) : null}
          <EditorPane
            mode={preferences.editorMode}
            markdown={documentState.markdown}
            onChange={documentState.updateMarkdown}
            adapterRef={editorRef}
            focusMode={preferences.focusMode}
            typewriterMode={preferences.typewriterMode}
            onImageUpload={uploadImage}
            resolveImageUrl={resolveVisualImageUrl}
            documentPath={documentState.path}
            theme={activeTheme}
          />
        </div>
      </div>

      <StatusBar
        statistics={statistics}
        cursor={cursor}
        mode={preferences.editorMode}
        focusMode={preferences.focusMode}
        typewriterMode={preferences.typewriterMode}
        onToggleFocus={toggleFocusMode}
        onToggleTypewriter={toggleTypewriterMode}
      />

      {commands.confirmationOpen ? (
        <ConfirmDialog
          onSave={() => void commands.saveAndContinue()}
          onDiscard={commands.discardAndContinue}
          onCancel={commands.cancelDeferred}
        />
      ) : null}

      {documentState.pendingExternal ? (
        <ExternalConflictDialog
          onReload={() => documentState.resolveExternalConflict("reload")}
          onKeep={() => documentState.resolveExternalConflict("keep")}
        />
      ) : null}

      {recoveryDraft ? (
        <RecoveryDialog
          draft={recoveryDraft}
          onRecover={() => {
            useDocumentStore.getState().newDocument();
            useDocumentStore.getState().updateMarkdown(recoveryDraft.markdown);
            removeRecoveryDraft(recoveryDraft.recoveryId);
            setRecoveryDraft(listRecoveryDrafts().at(-1) ?? null);
          }}
          onIgnore={() => {
            removeRecoveryDraft(recoveryDraft.recoveryId);
            setRecoveryDraft(listRecoveryDrafts().at(-1) ?? null);
          }}
        />
      ) : null}
    </main>
  );
}
