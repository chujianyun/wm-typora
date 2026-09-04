import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createBrowserNativeBridge } from "./browserBridge";
import type {
  CopiedImage,
  FileSnapshot,
  FileWriteResult,
  NativeBridge,
  WorkspaceEntry,
} from "./types";

class TauriNativeBridge implements NativeBridge {
  async openFile() {
    return invoke<FileSnapshot | null>("open_text_file");
  }

  async openWorkspace() {
    return invoke<{ path: string; entries: WorkspaceEntry[] } | null>("choose_workspace");
  }

  readFile(path: string) {
    return invoke<FileSnapshot>("read_text_file", { path });
  }

  writeFileAtomic(path: string, markdown: string, expectedDigest?: string | null) {
    return invoke<FileWriteResult>("write_text_file_atomic", {
      path,
      markdown,
      expectedDigest,
    });
  }

  async saveFileAs(markdown: string, suggestedName = "Untitled.md") {
    return invoke<FileWriteResult | null>("save_text_file_as", {
      markdown,
      suggestedName,
    });
  }

  scanWorkspace(path: string) {
    return invoke<WorkspaceEntry[]>("scan_workspace", { path });
  }

  copyImage(sourcePath: string, documentPath: string) {
    return invoke<CopiedImage>("copy_image", { sourcePath, documentPath });
  }

  storeImage(fileName: string, bytes: Uint8Array, documentPath: string) {
    return invoke<CopiedImage>("store_image", {
      fileName,
      bytes: Array.from(bytes),
      documentPath,
    });
  }

  resolveImagePath(documentPath: string, imagePath: string) {
    return invoke<string>("resolve_image_asset", { documentPath, imagePath });
  }

  async exportHtml(html: string, suggestedName = "document.html") {
    return invoke<string | null>("save_export_file_as", { html, suggestedName });
  }

  async watchOpenFiles(
    onOpen: (path: string) => void,
    onError: (error: unknown) => void,
  ) {
    let disposed = false;
    let pendingDrain: Promise<void> = Promise.resolve();
    const drain = () => {
      pendingDrain = pendingDrain
        .then(async () => {
          const paths = await invoke<string[]>("take_pending_open_files");
          if (!disposed) {
            const path = paths.at(-1);
            if (path) onOpen(path);
          }
        })
        .catch(onError);
      return pendingDrain;
    };
    const unlisten = await listen("open-file-requested", () => {
      void drain();
    });
    await drain();
    return async () => {
      disposed = true;
      unlisten();
      await pendingDrain;
    };
  }

  async watchFile(path: string, onChange: (path: string) => void) {
    const unlisten = await listen<{ path: string }>("file-changed", (event) => {
      if (event.payload.path === path) onChange(path);
    });
    let watchId: string;
    try {
      watchId = await invoke<string>("start_file_watch", { path });
    } catch (error) {
      unlisten();
      throw error;
    }
    return async () => {
      unlisten();
      await invoke("stop_file_watch", { path: watchId });
    };
  }
}

export const nativeBridge: NativeBridge = isTauri()
  ? new TauriNativeBridge()
  : createBrowserNativeBridge();
