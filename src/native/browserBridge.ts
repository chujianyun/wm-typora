import type {
  CopiedImage,
  FileSnapshot,
  FileWriteResult,
  NativeBridge,
  WorkspaceEntry,
  WorkspaceSnapshot,
} from "./types";

interface MemoryBridgeOptions {
  files?: Record<string, string>;
  now?: () => number;
  openPath?: string;
  workspacePath?: string;
}

interface MemoryFile {
  contents: string;
  modifiedAt: number;
}

const supportedFile = /\.(?:md|markdown|txt)$/i;
const ignoredDirectory = new Set(["node_modules", "dist", "build", "target", ".git"]);

function nameFromPath(path: string) {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

function digest(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function asSnapshot(path: string, file: MemoryFile): FileSnapshot {
  return {
    path,
    name: nameFromPath(path),
    markdown: file.contents,
    modifiedAt: file.modifiedAt,
    digest: digest(file.contents),
  };
}

function workspaceEntries(files: Map<string, MemoryFile>, directory: string): WorkspaceEntry[] {
  const prefix = directory.endsWith("/") ? directory : `${directory}/`;
  const directFiles: WorkspaceEntry[] = [];
  const childDirectories = new Set<string>();

  for (const path of files.keys()) {
    if (!path.startsWith(prefix)) continue;
    const relative = path.slice(prefix.length);
    const segments = relative.split("/");
    if (segments.some((part) => part.startsWith(".") || ignoredDirectory.has(part))) continue;
    if (segments.length > 1) {
      childDirectories.add(segments[0]);
    } else if (supportedFile.test(segments[0])) {
      directFiles.push({ name: segments[0], path, kind: "file" });
    }
  }

  const directories = [...childDirectories]
    .sort((left, right) => left.localeCompare(right))
    .map((name): WorkspaceEntry => {
      const path = `${prefix}${name}`.replace(/\/$/, "");
      return { name, path, kind: "directory", children: workspaceEntries(files, path) };
    })
    .filter((entry) => entry.children && entry.children.length > 0);

  return [
    ...directFiles.sort((left, right) => left.name.localeCompare(right.name)),
    ...directories,
  ];
}

export function createMemoryNativeBridge(options: MemoryBridgeOptions = {}): NativeBridge {
  const now = options.now ?? Date.now;
  const files = new Map<string, MemoryFile>(
    Object.entries(options.files ?? {}).map(([path, contents]) => [
      path,
      { contents, modifiedAt: now() },
    ]),
  );

  const readFile = async (path: string) => {
    const file = files.get(path);
    if (!file) throw { code: "not_found", message: "File not found", path };
    return asSnapshot(path, file);
  };

  const writeFileAtomic = async (
    path: string,
    markdown: string,
    expectedDigest?: string | null,
  ): Promise<FileWriteResult> => {
    const existing = files.get(path);
    if (expectedDigest && (!existing || digest(existing.contents) !== expectedDigest)) {
      throw { code: "external_change", message: "File changed on disk", path };
    }
    const modifiedAt = now();
    files.set(path, { contents: markdown, modifiedAt });
    return { path, modifiedAt, digest: digest(markdown) };
  };

  return {
    async openFile() {
      return options.openPath ? readFile(options.openPath) : null;
    },
    async openWorkspace(): Promise<WorkspaceSnapshot | null> {
      return options.workspacePath
        ? { path: options.workspacePath, entries: workspaceEntries(files, options.workspacePath) }
        : null;
    },
    readFile,
    writeFileAtomic,
    async saveFileAs(markdown, suggestedName = "Untitled.md") {
      const path = `/Downloads/${suggestedName}`;
      return writeFileAtomic(path, markdown);
    },
    async scanWorkspace(path) {
      return workspaceEntries(files, path);
    },
    async copyImage(sourcePath, documentPath): Promise<CopiedImage> {
      const source = files.get(sourcePath);
      if (!source) throw { code: "not_found", message: "Image not found", path: sourcePath };
      const documentName = nameFromPath(documentPath).replace(/\.[^.]+$/, "");
      const parent = documentPath.slice(0, documentPath.lastIndexOf("/"));
      const imageName = nameFromPath(sourcePath);
      const relativePath = `${documentName}.assets/${imageName}`;
      files.set(`${parent}/${relativePath}`, { ...source, modifiedAt: now() });
      return { absolutePath: `${parent}/${relativePath}`, relativePath };
    },
    async storeImage(fileName, bytes, documentPath) {
      const documentName = nameFromPath(documentPath).replace(/\.[^.]+$/, "");
      const parent = documentPath.includes("/")
        ? documentPath.slice(0, documentPath.lastIndexOf("/"))
        : ".";
      const relativePath = `${documentName}.assets/${nameFromPath(fileName)}`;
      files.set(`${parent}/${relativePath}`, {
        contents: `[binary:${bytes.byteLength}]`,
        modifiedAt: now(),
      });
      return { absolutePath: `${parent}/${relativePath}`, relativePath };
    },
    async resolveImagePath(_documentPath, imagePath) {
      return imagePath;
    },
    async exportHtml(_html, suggestedName = "document.html") {
      return `/Downloads/${suggestedName}`;
    },
    async watchFile() {
      return async () => undefined;
    },
  };
}

export function createBrowserNativeBridge(): NativeBridge {
  const bridge = createMemoryNativeBridge();

  return {
    ...bridge,
    openFile: () =>
      new Promise<FileSnapshot | null>((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".md,.markdown,.txt,text/plain,text/markdown";
        input.addEventListener("change", async () => {
          const file = input.files?.[0];
          if (!file) return resolve(null);
          const markdown = await file.text();
          resolve({
            path: file.name,
            name: file.name,
            markdown,
            modifiedAt: file.lastModified,
            digest: digest(markdown),
          });
        });
        input.click();
      }),
    async saveFileAs(markdown, suggestedName = "Untitled.md") {
      const link = document.createElement("a");
      link.download = suggestedName;
      link.href = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
      link.click();
      URL.revokeObjectURL(link.href);
      const modifiedAt = Date.now();
      return { path: suggestedName, modifiedAt, digest: digest(markdown) };
    },
    async exportHtml(html, suggestedName = "document.html") {
      const link = document.createElement("a");
      link.download = suggestedName;
      link.href = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
      link.click();
      URL.revokeObjectURL(link.href);
      return suggestedName;
    },
  };
}
