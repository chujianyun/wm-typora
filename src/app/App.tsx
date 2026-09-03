import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
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
import { buildHtmlDocument } from "../export/buildHtml";
import { printHtmlDocument } from "../export/print";
import { nativeBridge } from "../native/nativeBridge";
import type { NativeBridge } from "../native/types";
import { initializePreferences, usePreferenceStore } from "../preferences/preferenceStore";
import { buildOutline } from "../workspace/outline";
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
  const saveDocument = commands.saveDocument;
  const requestAction = commands.requestAction;
  const editorRef = useRef<EditorAdapter | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [findOpen, setFindOpen] = useState(false);
  const [recoveryDraft, setRecoveryDraft] = useState<RecoveryDraft | null>(
    () => listRecoveryDrafts().at(-1) ?? null,
  );
  const autosave = useMemo(
    () =>
      scheduleAutosave(async () => {
        await saveDocument();
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
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preferences.theme;

  useEffect(() => {
    void initializePreferences();
    return () => autosave.cancel();
  }, [autosave]);

  useEffect(() => {
    document.documentElement.dataset.theme = activeTheme;
  }, [activeTheme]);

  useEffect(() => {
    if (!documentState.path) return;
    let disposed = false;
    let stopWatching: (() => Promise<void>) | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    void bridge.watchFile(documentState.path, () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        const path = useDocumentStore.getState().path;
        if (!path) return;
        void bridge.readFile(path).then((snapshot) => {
          const current = useDocumentStore.getState();
          if (snapshot.markdown === current.persistedMarkdown) return;
          current.applyExternalChange(snapshot.markdown, snapshot.modifiedAt);
        }).catch(() => undefined);
      }, 80);
    }).then((stop) => {
      if (disposed) void stop();
      else stopWatching = stop;
    });
    return () => {
      disposed = true;
      if (debounce) clearTimeout(debounce);
      if (stopWatching) void stopWatching();
    };
  }, [bridge, documentState.path]);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | null = null;
    void getCurrentWindow().onCloseRequested((event) => {
      const status = useDocumentStore.getState().saveStatus;
      if (status === "clean") return;
      event.preventDefault();
      requestAction(() => getCurrentWindow().destroy());
    }).then((dispose) => {
      unlisten = dispose;
    });
    return () => unlisten?.();
  }, [requestAction]);

  useEffect(() => {
    const openExternalLink = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      if (!/^(https?:|mailto:)/i.test(href)) return;
      event.preventDefault();
      if (isTauri()) void openUrl(href);
      else window.open(href, "_blank", "noopener,noreferrer");
    };
    document.addEventListener("click", openExternalLink);
    return () => document.removeEventListener("click", openExternalLink);
  }, []);

  useEffect(() => {
    if (documentState.saveStatus === "dirty" || documentState.saveStatus === "error") {
      upsertRecoveryDraft({
        recoveryId: documentState.recoveryId,
        path: documentState.path,
        markdown: documentState.markdown,
        savedAt: Date.now(),
      });
      autosave.schedule(Boolean(documentState.path));
    } else {
      autosave.cancel();
      if (documentState.saveStatus === "clean") removeRecoveryDraft(documentState.recoveryId);
    }
  }, [
    documentState.markdown,
    documentState.path,
    documentState.recoveryId,
    documentState.saveStatus,
    autosave,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier) return;
      const key = event.key.toLowerCase();
      if (key === "s" && event.shiftKey) {
        event.preventDefault();
        void commands.saveAsDocument();
      } else if (key === "s") {
        event.preventDefault();
        void commands.saveDocument();
      } else if (key === "o") {
        event.preventDefault();
        commands.openFile();
      } else if (key === "n") {
        event.preventDefault();
        commands.newDocument();
      } else if (key === "f") {
        event.preventDefault();
        setFindOpen(true);
      } else if (event.shiftKey && key === "m") {
        event.preventDefault();
        preferences.setEditorMode(preferences.editorMode === "visual" ? "source" : "visual");
      } else if (event.shiftKey && key === "l") {
        event.preventDefault();
        preferences.toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commands, preferences]);

  const cycleTheme = () => {
    preferences.setTheme(
      preferences.theme === "system" ? "light" : preferences.theme === "light" ? "dark" : "system",
    );
  };

  const exportName = `${fileName(documentState.path).replace(/\.[^.]+$/, "")}.html`;
  const buildExport = () =>
    buildHtmlDocument(documentState.markdown, {
      title: fileName(documentState.path),
      theme: activeTheme,
    });

  const insertDroppedImages = async (files: FileList) => {
    let path = useDocumentStore.getState().path;
    if (!path) {
      if (!(await commands.saveDocument())) return;
      path = useDocumentStore.getState().path;
    }
    if (!path) return;

    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      const copied = await bridge.storeImage(
        file.name || `image-${Date.now()}.png`,
        new Uint8Array(await file.arrayBuffer()),
        path,
      );
      const current = useDocumentStore.getState().markdown;
      useDocumentStore.getState().updateMarkdown(
        `${current}${current.endsWith("\n") || !current ? "" : "\n\n"}![${file.name}](${copied.relativePath})\n`,
      );
    }
  };

  const uploadImage = useCallback(async (file: File) => {
    let path = useDocumentStore.getState().path;
    if (!path) {
      if (!(await saveDocument())) throw new Error("保存文档后才能插入图片");
      path = useDocumentStore.getState().path;
    }
    if (!path) throw new Error("保存文档后才能插入图片");
    const copied = await bridge.storeImage(
      file.name || `image-${Date.now()}.png`,
      new Uint8Array(await file.arrayBuffer()),
      path,
    );
    return copied.relativePath;
  }, [bridge, saveDocument]);

  return (
    <main className="app-shell">
      <TitleBar
        fileName={fileName(documentState.path)}
        saveStatus={documentState.saveStatus}
        mode={preferences.editorMode}
        theme={preferences.theme}
        onNew={commands.newDocument}
        onOpen={commands.openFile}
        onOpenWorkspace={() => void commands.openWorkspace()}
        onSave={() => void commands.saveDocument()}
        onSaveAs={() => void commands.saveAsDocument()}
        onToggleSidebar={preferences.toggleSidebar}
        onToggleMode={() =>
          preferences.setEditorMode(preferences.editorMode === "visual" ? "source" : "visual")
        }
        onToggleFind={() => setFindOpen((value) => !value)}
        onExportHtml={() => {
          void buildExport().then((html) => bridge.exportHtml(html, exportName));
        }}
        onPrint={() => {
          void buildExport().then(printHtmlDocument);
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
            onTab={workspace.setActiveTab}
            onOpenFile={commands.openPath}
            onToggleDirectory={workspace.toggleExpanded}
            onNavigate={(id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })}
          />
        ) : null}
        <div
          className="writing-area"
          onDrop={(event) => {
            event.preventDefault();
            if (preferences.editorMode === "source") {
              void insertDroppedImages(event.dataTransfer.files);
            }
          }}
          onPaste={(event) => {
            if (preferences.editorMode === "source" && event.clipboardData.files.length) {
              event.preventDefault();
              void insertDroppedImages(event.clipboardData.files);
            }
          }}
          onDragOver={(event) => event.preventDefault()}
          onKeyUp={() => setCursor(editorRef.current?.getCursor() ?? { line: 1, column: 1 })}
          onMouseUp={() => setCursor(editorRef.current?.getCursor() ?? { line: 1, column: 1 })}
        >
          {findOpen ? (
            <FindPanel
              markdown={documentState.markdown}
              onReplace={documentState.updateMarkdown}
              onClose={() => setFindOpen(false)}
            />
          ) : null}
          {documentState.saveError ? (
            <div className="error-banner" role="alert">{documentState.saveError}</div>
          ) : null}
          <EditorPane
            mode={preferences.editorMode}
            markdown={documentState.markdown}
            onChange={documentState.updateMarkdown}
            adapterRef={editorRef}
            focusMode={preferences.focusMode}
            typewriterMode={preferences.typewriterMode}
            onImageUpload={uploadImage}
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
        onToggleFocus={preferences.toggleFocusMode}
        onToggleTypewriter={preferences.toggleTypewriterMode}
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
            setRecoveryDraft(null);
          }}
          onIgnore={() => {
            removeRecoveryDraft(recoveryDraft.recoveryId);
            setRecoveryDraft(null);
          }}
        />
      ) : null}
    </main>
  );
}
