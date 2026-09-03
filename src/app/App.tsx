import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
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
      if (key === "s") {
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
      const sourcePath = (file as File & { path?: string }).path;
      if (!sourcePath || !file.type.startsWith("image/")) continue;
      const copied = await bridge.copyImage(sourcePath, path);
      const current = useDocumentStore.getState().markdown;
      useDocumentStore.getState().updateMarkdown(
        `${current}${current.endsWith("\n") || !current ? "" : "\n\n"}![${file.name}](${copied.relativePath})\n`,
      );
    }
  };

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
            void insertDroppedImages(event.dataTransfer.files);
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
