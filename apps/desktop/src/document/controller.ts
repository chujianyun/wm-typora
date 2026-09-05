import { Compartment, EditorState, Prec } from "@codemirror/state";
import {
  EditorView,
  keymap,
  drawSelection,
  placeholder,
} from "@codemirror/view";
import {
  defaultKeymap,
  historyKeymap,
  undo,
  redo,
  indentWithTab,
} from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import type { NativeBridge } from "../native/bridge";
import type {
  Session,
  Opened,
  SaveRequest,
  RecoverySnapshot,
  DiskEvent,
} from "./protocol";
import { failure } from "./protocol";
import { fromOpened, reduceSession, type SessionEvent } from "./session";
import { createBuffer, serialize } from "../editor/buffer";
import { createSaveQueue, type SaveQueue } from "./saveQueue";
import { createRecoveryQueue } from "./recovery";

export type Modal =
  | { kind: "close" }
  | { kind: "recovery"; snapshots: RecoverySnapshot[] }
  | { kind: "conflict"; disk: string | null };
export interface UIState {
  session: Session | null;
  modal: Modal | null;
  warning: string | null;
  busy: boolean;
  line: number;
  column: number;
  chars: number;
}
export class DocumentController {
  readonly view: EditorView;
  ui: UIState = {
    session: null,
    modal: null,
    warning: null,
    busy: false,
    line: 1,
    column: 1,
    chars: 0,
  };
  private subscribers = new Set<() => void>();
  private queue: SaveQueue | null = null;
  private recovery: ReturnType<typeof createRecoveryQueue> | null = null;
  private lock = new Compartment();
  private timer: ReturnType<typeof setInterval> | undefined;
  private disposed = false;
  private inspecting = false;
  private composing = false;
  private recoveryId = crypto.randomUUID();
  private restoredId: string | null = null;
  private lastEvent: DiskEvent | null = null;
  constructor(
    host: HTMLElement,
    readonly bridge: NativeBridge,
  ) {
    this.view = new EditorView({ parent: host });
  }
  subscribe(fn: () => void) {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }
  private publish(p: Partial<UIState> = {}) {
    if (this.disposed) return;
    this.ui = { ...this.ui, ...p };
    for (const f of this.subscribers) f();
  }
  private error(e: unknown) {
    this.publish({ warning: failure(e).message });
  }
  private dispatch(e: SessionEvent) {
    if (!this.ui.session) return;
    this.publish({ session: reduceSession(this.ui.session, e) });
  }
  text() {
    return serialize(this.view.state);
  }
  private setReadonly(value: boolean) {
    this.view.dispatch({
      effects: this.lock.reconfigure(
        Prec.highest([
          EditorState.readOnly.of(value),
          EditorView.editable.of(!value),
        ]),
      ),
    });
  }
  private stats() {
    const pos = this.view.state.selection.main.head,
      line = this.view.state.doc.lineAt(pos);
    this.publish({
      line: line.number,
      column: pos - line.from + 1,
      chars: this.view.state.doc.length,
    });
  }
  private install(o: Opened) {
    this.queue?.dispose();
    this.recovery?.dispose();
    this.recoveryId = crypto.randomUUID();
    this.lastEvent = null;
    this.publish({ session: fromOpened(o), modal: null, warning: null });
    this.view.setState(
      createBuffer(o.text, o.format, o.readOnly, [
        this.lock.of(
          Prec.highest([
            EditorState.readOnly.of(o.readOnly),
            EditorView.editable.of(!o.readOnly),
          ]),
        ),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          indentWithTab,
        ]),
        drawSelection(),
        syntaxHighlighting(defaultHighlightStyle),
        EditorView.lineWrapping,
        placeholder("从这里开始写作…"),
        EditorView.contentAttributes.of({
          "aria-label": "文档编辑器",
          spellcheck: "true",
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && this.ui.session) {
            this.dispatch({
              type: "edited",
              version: this.ui.session.version + 1,
            });
            this.queue?.edited();
            if (!this.composing) this.recovery?.schedule();
          }
          if (update.docChanged || update.selectionSet) this.stats();
        }),
        EditorView.domEventHandlers({
          compositionstart: () => {
            this.composing = true;
            this.queue?.setComposing(true);
          },
          compositionend: () => {
            setTimeout(() => {
              if (this.disposed) return;
              this.composing = false;
              this.queue?.setComposing(false);
              this.recovery?.schedule();
            }, 0);
          },
        }),
      ]),
    );
    this.queue = createSaveQueue({
      getSession: () => this.ui.session!,
      snapshot: () => this.text(),
      requestId: () => crypto.randomUUID(),
      save: (r) => this.bridge.save(r),
      dispatch: (e) => this.dispatch(e),
    });
    this.recovery = createRecoveryQueue(
      () => {
        const s = this.ui.session!;
        if (this.composing || s.readOnly || s.phase === "clean") return null;
        return {
          sessionId: s.sessionId,
          epoch: s.epoch,
          recoveryId: this.recoveryId,
          version: s.version,
          format: s.format,
          text: this.text(),
          sourcePath: s.path,
          sourceRevision: s.revision,
          updatedAt: new Date().toISOString(),
        };
      },
      (s) => this.bridge.writeRecovery(s),
      (e) => this.error(e),
    );
    this.stats();
  }
  async initialize() {
    try {
      const opened = await this.bridge.initialize();
      if (this.disposed) return;
      this.install(opened);
      const list = await this.bridge.listRecovery();
      if (this.disposed) return;
      if (list.snapshots.length)
        this.publish({
          modal: { kind: "recovery", snapshots: list.snapshots },
        });
      if (list.warnings.length)
        this.publish({ warning: list.warnings.join("；") });
      this.timer = setInterval(() => {
        void this.checkDisk();
      }, 750);
    } catch (e) {
      this.error(e);
    }
  }
  private request(): SaveRequest {
    const s = this.ui.session!;
    return {
      sessionId: s.sessionId,
      epoch: s.epoch,
      requestId: crypto.randomUUID(),
      version: s.version,
      text: this.text(),
      expected: s.revision,
    };
  }
  async save(as = false) {
    const s = this.ui.session;
    if (!s || s.readOnly || this.ui.busy) return;
    if (this.composing) {
      await this.queue?.flush();
      if (this.composing || this.disposed) return;
    }
    if (s.phase === "conflict" && !as) {
      await this.showConflict();
      return;
    }
    if (s.durability === "uncertain" && !as) {
      this.error({ message: "上次写入的持久性未确认，请检查磁盘或另存为。" });
      return;
    }
    this.publish({ busy: true, warning: null });
    this.setReadonly(true);
    try {
      if (as || !this.ui.session!.path) {
        await this.queue?.idle();
        const req = this.request(),
          result = await this.bridge.saveAs(req);
        if (result) {
          const { opened, reply } = result,
            current = this.ui.session!;
          this.publish({
            session: {
              ...current,
              path: opened.path,
              revision: opened.revision,
              format: opened.format,
              activeRequest: req,
              phase: "saving",
            },
          });
          this.dispatch({ type: "saveFinished", reply });
          this.lastEvent = null;
          if (
            this.ui.modal?.kind === "conflict" &&
            this.ui.session!.phase === "clean"
          )
            this.publish({ modal: null });
        }
      } else {
        if (this.ui.session!.phase === "error")
          this.publish({
            session: { ...this.ui.session!, phase: "dirty", error: null },
          });
        await this.queue?.flush();
      }
      if (this.ui.session!.phase === "clean") {
        await this.recovery?.flush();
        await this.bridge.discardRecovery(this.recoveryId);
        if (this.restoredId) {
          await this.bridge.discardRecovery(this.restoredId);
          this.restoredId = null;
        }
      }
    } catch (e) {
      this.error(e);
    } finally {
      if (!this.disposed) {
        this.setReadonly(this.ui.session!.readOnly);
        this.publish({ busy: false });
      }
    }
  }
  async close() {
    if (this.ui.busy || !this.ui.session) return;
    await this.queue?.idle();
    const s = this.ui.session!;
    if (s.phase !== "clean" || s.durability === "uncertain")
      this.publish({ modal: { kind: "close" } });
    else await this.finishClose();
  }
  private async finishClose(discard = false) {
    try {
      this.publish({ busy: true });
      this.setReadonly(true);
      await this.queue?.idle();
      if (discard) await this.recovery?.idle().catch(() => {});
      else await this.recovery?.flush();
      await this.bridge.discardRecovery(this.recoveryId);
      if (discard && this.restoredId) {
        await this.bridge.discardRecovery(this.restoredId);
        this.restoredId = null;
      }
      await this.bridge.close(this.ui.session!);
    } catch (e) {
      this.error(e);
      this.setReadonly(this.ui.session!.readOnly);
      this.publish({ busy: false });
    }
  }
  async saveAndClose() {
    await this.save();
    if (this.ui.session?.phase === "clean") await this.finishClose();
  }
  async discardAndClose() {
    await this.finishClose(true);
  }
  async cancelModal() {
    if (this.ui.busy) return;
    this.publish({ modal: null });
    await this.bridge.cancelQuit();
    this.view.focus();
  }
  undo() {
    if (!this.ui.busy) undo(this.view);
  }
  redo() {
    if (!this.ui.busy) redo(this.view);
  }
  async checkDisk() {
    const s = this.ui.session;
    if (
      this.disposed ||
      this.inspecting ||
      this.ui.busy ||
      this.ui.modal ||
      this.composing ||
      !s?.path ||
      s.activeRequest
    )
      return;
    this.inspecting = true;
    try {
      const event = await this.bridge.inspect(s);
      if (this.disposed || !event || this.ui.session?.epoch !== s.epoch) return;
      this.lastEvent = event;
      const now = this.ui.session!;
      if (
        event.kind === "changed" &&
        now.phase === "clean" &&
        now.version === s.version
      ) {
        await this.adoptDisk(false);
      } else {
        this.dispatch({ type: "diskChanged", event });
        this.publish({
          warning:
            event.kind === "missing"
              ? "文件已被移走或删除，正文仍保留在此窗口。"
              : "文件在外部发生变化，请比较后选择处理方式。",
        });
      }
    } catch (e) {
      this.error(e);
    } finally {
      this.inspecting = false;
    }
  }
  async showConflict() {
    const s = this.ui.session;
    if (!s) return;
    let disk: string | null = null;
    try {
      const o = await this.bridge.reload(s, this.lastEvent?.revision ?? null);
      disk = o.text;
    } catch (e) {
      this.error(e);
    }
    this.publish({ modal: { kind: "conflict", disk } });
  }
  async adoptDisk(explicit = true) {
    const s = this.ui.session;
    if (!s || this.ui.busy || this.composing) return;
    if (explicit && this.lastEvent?.kind === "missing") {
      this.error({ message: "磁盘文件已不存在，请另存为。" });
      return;
    }
    this.publish({ busy: true });
    this.setReadonly(true);
    try {
      await this.queue?.idle();
      await this.recovery?.flush();
      const candidate = await this.bridge.reload(
        s,
        this.lastEvent?.revision ?? null,
      );
      if (!candidate.revision) throw { message: "磁盘文件不可读取" };
      const opened = await this.bridge.commitReload(s, candidate.revision);
      if (this.disposed) return;
      this.install(opened);
    } catch (e) {
      if (this.lastEvent)
        this.dispatch({ type: "diskChanged", event: this.lastEvent });
      this.error(e);
    } finally {
      if (!this.disposed) {
        this.setReadonly(this.ui.session!.readOnly);
        this.publish({ busy: false });
      }
    }
  }
  async restore(snapshot: RecoverySnapshot) {
    if (
      this.ui.busy ||
      !this.ui.session ||
      this.ui.session.phase !== "clean" ||
      this.ui.session.path
    ) {
      this.error({ message: "请在新的空白窗口中恢复草稿。" });
      return;
    }
    const before = this.ui.session;
    this.publish({ busy: true });
    this.setReadonly(true);
    try {
      const opened = await this.bridge.restoreRecovery(snapshot.recoveryId);
      if (
        this.disposed ||
        this.ui.session?.sessionId !== before.sessionId ||
        this.ui.session.version !== before.version
      ) {
        await this.bridge.release(opened);
        return;
      }
      await this.bridge.release(before);
      this.install(opened);
      this.restoredId = snapshot.recoveryId;
      this.publish({
        session: { ...this.ui.session!, phase: "dirty", version: 1 },
        warning: "已恢复为未命名文档。原文件未被覆盖。",
      });
      await this.recovery?.flush();
    } catch (e) {
      this.error(e);
    } finally {
      if (!this.disposed) {
        this.setReadonly(this.ui.session!.readOnly);
        this.publish({ busy: false });
      }
    }
  }
  async ignoreRecovery(id: string) {
    try {
      await this.bridge.discardRecovery(id);
      const modal = this.ui.modal;
      if (modal?.kind === "recovery") {
        const snapshots = modal.snapshots.filter((s) => s.recoveryId !== id);
        this.publish({
          modal: snapshots.length ? { kind: "recovery", snapshots } : null,
        });
      }
    } catch (e) {
      this.error(e);
    }
  }
  async command(id: string) {
    try {
      switch (id) {
        case "document.new":
          await this.bridge.newWindow();
          break;
        case "document.open":
          await this.bridge.open();
          break;
        case "document.save":
          await this.save();
          break;
        case "document.saveAs":
          await this.save(true);
          break;
        case "document.close":
          await this.close();
          break;
        case "edit.undo":
          this.undo();
          break;
        case "edit.redo":
          this.redo();
          break;
      }
    } catch (e) {
      this.error(e);
    }
  }
  dispose() {
    this.disposed = true;
    clearInterval(this.timer);
    this.queue?.dispose();
    this.recovery?.dispose();
    this.view.destroy();
    this.subscribers.clear();
  }
}
