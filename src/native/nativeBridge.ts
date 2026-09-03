import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { createBrowserNativeBridge } from "./browserBridge";
import type {
  CopiedImage,
  FileSnapshot,
  FileWriteResult,
  NativeBridge,
  WorkspaceEntry,
} from "./types";

class TauriNativeBridge implements NativeBridge {
  private async grantPath(path: string) {
    await invoke("grant_path", { path });
  }

  async openFile() {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
    });
    if (!path) return null;
    await this.grantPath(path);
    return this.readFile(path);
  }

  async openWorkspace() {
    const path = await open({ multiple: false, directory: true });
    if (!path) return null;
    await this.grantPath(path);
    return { path, entries: await this.scanWorkspace(path) };
  }

  readFile(path: string) {
    return invoke<FileSnapshot>("read_text_file", { path });
  }

  writeFileAtomic(path: string, markdown: string) {
    return invoke<FileWriteResult>("write_text_file_atomic", { path, markdown });
  }

  async saveFileAs(markdown: string, suggestedName = "Untitled.md") {
    const path = await save({
      defaultPath: suggestedName,
      filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
    });
    if (!path) return null;
    await this.grantPath(path);
    return this.writeFileAtomic(path, markdown);
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

  async exportHtml(html: string, suggestedName = "document.html") {
    const path = await save({
      defaultPath: suggestedName,
      filters: [{ name: "HTML", extensions: ["html"] }],
    });
    if (!path) return null;
    await this.grantPath(path);
    await invoke("write_export_file", { path, html });
    return path;
  }

  async watchFile(path: string, onChange: (path: string) => void) {
    const unlisten = await listen<{ path: string }>("file-changed", (event) => {
      if (event.payload.path === path) onChange(path);
    });
    const watchId = await invoke<string>("start_file_watch", { path });
    return async () => {
      unlisten();
      await invoke("stop_file_watch", { path: watchId });
    };
  }
}

export const nativeBridge: NativeBridge = isTauri()
  ? new TauriNativeBridge()
  : createBrowserNativeBridge();
