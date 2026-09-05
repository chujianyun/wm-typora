import { invoke } from "@tauri-apps/api/core";
import type {
  Opened,
  SaveRequest,
  SaveReply,
  SessionKey,
  Revision,
  DiskEvent,
  RecoverySnapshot,
  RecoveryList,
} from "../document/protocol";
export interface NativeBridge {
  initialize(): Promise<Opened>;
  newWindow(): Promise<void>;
  open(): Promise<void>;
  save(request: SaveRequest): Promise<SaveReply>;
  saveAs(
    request: SaveRequest,
  ): Promise<{ opened: Opened; reply: SaveReply } | null>;
  restoreRecovery(id: string): Promise<Opened>;
  release(key: SessionKey): Promise<void>;
  inspect(key: SessionKey): Promise<DiskEvent | null>;
  reload(key: SessionKey, expected: Revision | null): Promise<Opened>;
  commitReload(key: SessionKey, expected: Revision): Promise<Opened>;
  writeRecovery(snapshot: RecoverySnapshot): Promise<number>;
  listRecovery(): Promise<RecoveryList>;
  discardRecovery(id: string): Promise<void>;
  close(key: SessionKey): Promise<void>;
  cancelQuit(): Promise<void>;
}
export const nativeBridge: NativeBridge = {
  initialize: () => invoke("initialize"),
  newWindow: () => invoke("new_window"),
  open: () => invoke("open_document"),
  save: (request) => invoke("save_document", { request }),
  saveAs: (request) => invoke("save_as", { request }),
  restoreRecovery: (recoveryId) => invoke("restore_recovery", { recoveryId }),
  release: (key) => invoke("release_document", { sessionId: key.sessionId }),
  inspect: (key) => invoke("inspect_document", key),
  reload: (key, expected) => invoke("reload_document", { ...key, expected }),
  commitReload: (key, expected) =>
    invoke("commit_reload", { ...key, expected }),
  writeRecovery: (snapshot) => invoke("write_recovery", { snapshot }),
  listRecovery: () => invoke("list_recovery"),
  discardRecovery: (recoveryId) => invoke("discard_recovery", { recoveryId }),
  close: (key) => invoke("close_document", { sessionId: key.sessionId }),
  cancelQuit: () => invoke("cancel_quit"),
};
