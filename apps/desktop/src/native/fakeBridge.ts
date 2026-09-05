// Explicit development preview/test adapter; never selected as a production fallback.
import type { NativeBridge } from "./bridge";
import type {
  Opened,
  SaveRequest,
  SaveReply,
  RecoverySnapshot,
  Revision,
} from "../document/protocol";
export class FakeBridge implements NativeBridge {
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
  async open() {}
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
