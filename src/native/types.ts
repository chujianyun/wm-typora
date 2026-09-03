export interface NativeError {
  code: string;
  message: string;
  path?: string;
}

export interface FileSnapshot {
  path: string;
  name: string;
  markdown: string;
  modifiedAt: number;
  digest: string;
}

export interface FileWriteResult {
  path: string;
  modifiedAt: number;
  digest: string;
}

export interface WorkspaceEntry {
  name: string;
  path: string;
  kind: "file" | "directory";
  children?: WorkspaceEntry[];
}

export interface WorkspaceSnapshot {
  path: string;
  entries: WorkspaceEntry[];
}

export interface CopiedImage {
  absolutePath: string;
  relativePath: string;
}

export interface NativeBridge {
  openFile(): Promise<FileSnapshot | null>;
  openWorkspace(): Promise<WorkspaceSnapshot | null>;
  readFile(path: string): Promise<FileSnapshot>;
  writeFileAtomic(path: string, markdown: string): Promise<FileWriteResult>;
  saveFileAs(markdown: string, suggestedName?: string): Promise<FileWriteResult | null>;
  scanWorkspace(path: string): Promise<WorkspaceEntry[]>;
  copyImage(sourcePath: string, documentPath: string): Promise<CopiedImage>;
  exportHtml(html: string, suggestedName?: string): Promise<string | null>;
}
