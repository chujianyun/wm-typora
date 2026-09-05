import { it, expect, afterEach } from "vitest";
import { DocumentController } from "./controller";
import { FakeBridge } from "../native/fakeBridge";
const controllers: DocumentController[] = [];
afterEach(() => {
  controllers.forEach((c) => c.dispose());
  controllers.length = 0;
  document.body.innerHTML = "";
});
async function setup() {
  const host = document.createElement("div");
  document.body.append(host);
  const bridge = new FakeBridge();
  const c = new DocumentController(host, bridge);
  controllers.push(c);
  await c.initialize();
  return { c, bridge };
}
it("cancel close preserves text and undo history", async () => {
  const { c, bridge } = await setup();
  c.view.dispatch({ changes: { from: 0, insert: "# 草稿" } });
  await c.close();
  expect(c.ui.modal?.kind).toBe("close");
  await c.cancelModal();
  expect(c.text()).toBe("# 草稿");
  expect(bridge.closed).toBe(false);
  c.undo();
  expect(c.text()).toBe("");
});
it("cancelled Save As preserves untitled text and identity", async () => {
  const { c, bridge } = await setup();
  c.view.dispatch({ changes: { from: 0, insert: "中文" } });
  const id = c.ui.session!.sessionId;
  bridge.cancelSaveAs = true;
  await c.save();
  expect(c.ui.session!.path).toBeNull();
  expect(c.ui.session!.sessionId).toBe(id);
  expect(c.text()).toBe("中文");
});
it("save then edit persists latest version", async () => {
  const { c, bridge } = await setup();
  c.view.dispatch({ changes: { from: 0, insert: "one" } });
  await c.save();
  expect(bridge.disk).toBe("one");
  expect(c.ui.session!.phase).toBe("clean");
  c.view.dispatch({ changes: { from: 3, insert: " two" } });
  await c.save();
  expect(bridge.disk).toBe("one two");
  expect(c.ui.session!.phase).toBe("clean");
});
it("failed save keeps dirty text and prevents close", async () => {
  const { c, bridge } = await setup();
  c.view.dispatch({ changes: { from: 0, insert: "unsaved" } });
  bridge.failSave = true;
  await c.save();
  await c.close();
  expect(bridge.closed).toBe(false);
  expect(c.text()).toBe("unsaved");
  expect(c.ui.modal?.kind).toBe("close");
});
it("Save As resolves conflict and resumes autosave", async () => {
  const { c, bridge } = await setup();
  c.view.dispatch({ changes: { from: 0, insert: "local" } });
  await c.save();
  c.view.dispatch({ changes: { from: 5, insert: " edit" } });
  bridge.external = true;
  bridge.disk = "external";
  await c.checkDisk();
  await c.showConflict();
  expect(c.ui.session!.phase).toBe("conflict");
  await c.save(true);
  expect(c.ui.session!.phase).toBe("clean");
  expect(c.ui.modal).toBeNull();
  c.view.dispatch({ changes: { from: 10, insert: " again" } });
  await c.save();
  expect(bridge.disk).toBe("local edit again");
});
it("explicit discard closes even when recovery storage is unavailable", async () => {
  const { c, bridge } = await setup();
  c.view.dispatch({ changes: { from: 0, insert: "discard me" } });
  bridge.writeRecovery = async () => {
    throw new Error("recovery disk full");
  };
  await c.close();
  await c.discardAndClose();
  expect(bridge.closed).toBe(true);
});
it("discarding restored text also discards the original recovery record", async () => {
  const { c, bridge } = await setup();
  const snapshot = {
    sessionId: "crashed",
    epoch: 1,
    recoveryId: crypto.randomUUID(),
    version: 4,
    text: "old draft",
    format: { encoding: "utf-8" as const, eol: "lf" as const },
    sourcePath: null,
    sourceRevision: null,
    updatedAt: "now",
  };
  bridge.drafts.set(snapshot.recoveryId, snapshot);
  await c.restore(snapshot);
  await c.close();
  await c.discardAndClose();
  expect(bridge.drafts.has(snapshot.recoveryId)).toBe(false);
});
it("locks editing and cancellation while recovery is loading", async () => {
  const { c, bridge } = await setup();
  let resolve: ((o: typeof bridge.opened) => void) | undefined;
  bridge.restoreRecovery = () =>
    new Promise((r) => {
      resolve = r;
    });
  const snapshot = {
    sessionId: "old",
    epoch: 1,
    recoveryId: "draft",
    version: 1,
    text: "recover",
    format: { encoding: "utf-8" as const, eol: "lf" as const },
    sourcePath: null,
    sourceRevision: null,
    updatedAt: "now",
  };
  const restoring = c.restore(snapshot);
  expect(c.ui.busy).toBe(true);
  expect(c.view.state.readOnly).toBe(true);
  await c.cancelModal();
  expect(c.ui.busy).toBe(true);
  resolve!({ ...bridge.opened, sessionId: "restored", text: "recover" });
  await restoring;
  expect(c.text()).toBe("recover");
  expect(c.ui.busy).toBe(false);
});
