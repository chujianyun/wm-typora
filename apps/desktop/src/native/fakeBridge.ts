import type { ExportRequest, ExportImage } from "../export/document";
// Explicit development preview/test adapter; never selected as a production fallback.
import type { NativeBridge } from "./bridge";
import type {
  Opened,
  SessionKey,
  SaveRequest,
  SaveReply,
  RecoverySnapshot,
  Revision,
} from "../document/protocol";
export class FakeBridge implements NativeBridge {
  exports: ExportRequest[] = [];
  async exportDocument(request: ExportRequest): Promise<string | null> {
    this.exports.push(request);
    return `/exports/${request.name}`;
  }
  revealed: string[] = [];
  async revealInFolder(path: string): Promise<void> {
    this.revealed.push(path);
  }
  async exportImage(_url: string): Promise<ExportImage> {
    throw new Error("浏览器预览不读取外部图片");
  }
  localImages = new Map<string, ExportImage>();
  async readLocalImage(source: string, _documentPath: string | null) {
    const file = this.localImages.get(source);
    if (!file) throw new Error("图片文件不存在或无法读取");
    return file;
  }
  opened: Opened = {
    sessionId: crypto.randomUUID(),
    epoch: 1,
    path: null,
    text: "",
    format: { encoding: "utf-8", eol: "lf" },
    revision: null,
    readOnly: false,
  };
  disk = "";
  recentPaths: string[] = [];
  async recentFiles() {
    return [...this.recentPaths];
  }
  closed = false;
  cancelSaveAs = false;
  failSave = false;
  external = false;
  seq = 0;
  drafts = new Map<string, RecoverySnapshot>();
  private revision(text: string): Revision {
    return {
      hash: text,
      size: new TextEncoder().encode(text).length,
      modifiedAtNs: "1",
      identity: "virtual",
    };
  }
  async initialize() {
    return structuredClone(this.opened);
  }
  async newWindow() {
    this.opened = {
      ...this.opened,
      sessionId: crypto.randomUUID(),
      path: null,
      text: "",
      revision: null,
    };
  }
  async open(_replace?: SessionKey): Promise<Opened | null> {
    return null;
  }
  async openPath(_path: string, _replace?: SessionKey): Promise<Opened | null> {
    return null;
  }
  async windowState() {}
  async uploadImage(): Promise<string> {
    throw new Error("浏览器演示不连接图床，请在桌面版中使用。");
  }
  async save(r: SaveRequest): Promise<SaveReply> {
    if (this.failSave)
      return {
        ...r,
        kind: "failed",
        error: { code: "io", message: "磁盘写入失败" },
      };
    if (this.external)
      return { ...r, kind: "conflict", disk: this.revision(this.disk) };
    this.disk = r.text;
    this.opened.revision = this.revision(r.text);
    return {
      ...r,
      kind: "saved",
      revision: this.opened.revision,
      durability: "confirmed",
    };
  }
  async saveAs(r: SaveRequest) {
    if (this.cancelSaveAs) return null;
    if (this.failSave) throw { code: "io", message: "磁盘写入失败" };
    this.external = false;
    this.disk = r.text;
    this.opened = {
      ...this.opened,
      path: "/preview/无标题.md",
      text: r.text,
      revision: this.revision(r.text),
    };
    return {
      opened: structuredClone(this.opened),
      reply: {
        ...r,
        kind: "saved" as const,
        revision: this.opened.revision!,
        durability: "confirmed" as const,
      },
    };
  }
  async inspect() {
    return this.external
      ? {
          sessionId: this.opened.sessionId,
          epoch: this.opened.epoch,
          eventSeq: ++this.seq,
          kind: "changed" as const,
          revision: this.revision(this.disk),
        }
      : null;
  }
  async reload() {
    return {
      ...this.opened,
      text: this.disk,
      revision: this.revision(this.disk),
    };
  }
  async commitReload() {
    this.external = false;
    this.opened = {
      ...this.opened,
      epoch: this.opened.epoch + 1,
      text: this.disk,
      revision: this.revision(this.disk),
    };
    return structuredClone(this.opened);
  }
  async writeRecovery(s: RecoverySnapshot) {
    this.drafts.set(s.recoveryId, structuredClone(s));
    return s.version;
  }
  async restoreRecovery(id: string) {
    const s = this.drafts.get(id)!;
    this.opened = {
      ...this.opened,
      text: s.text,
      format: s.format,
      path: null,
    };
    return this.opened;
  }
  async listRecovery() {
    return { snapshots: [...this.drafts.values()], warnings: [] };
  }
  async discardRecovery(id: string) {
    this.drafts.delete(id);
  }
  async close() {
    this.closed = true;
  }
  async cancelQuit() {}
  async release() {}
}
