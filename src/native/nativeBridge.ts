import { invoke, isTauri } from "@tauri-apps/api/core";
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
}

export const nativeBridge: NativeBridge = isTauri()
  ? new TauriNativeBridge()
  : createBrowserNativeBridge();
