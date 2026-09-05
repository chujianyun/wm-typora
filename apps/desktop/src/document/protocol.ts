export type Format = {
  encoding: "utf-8" | "utf-8-bom";
  eol: "lf" | "crlf" | "mixed" | "cr";
};
export type Revision = {
  hash: string;
  size: number;
  modifiedAtNs: string;
  identity: string;
};
export type SessionKey = { sessionId: string; epoch: number };
export type Failure = { code: string; message: string };
export type Opened = SessionKey & {
  path: string | null;
  text: string;
  format: Format;
  revision: Revision | null;
  readOnly: boolean;
};
export type SaveRequest = SessionKey & {
  requestId: string;
  version: number;
  text: string;
  expected: Revision | null;
};
export type SaveReply = SessionKey & { requestId: string; version: number } & (
    | {
        kind: "saved" | "unchanged";
        revision: Revision;
        durability: "confirmed" | "uncertain";
      }
    | { kind: "conflict"; disk: Revision | null }
    | { kind: "failed"; error: Failure }
  );
export type DiskEvent = SessionKey & {
  eventSeq: number;
  kind: "changed" | "missing" | "unreadable";
  revision: Revision | null;
};
export type RecoverySnapshot = SessionKey & {
  recoveryId: string;
  version: number;
  text: string;
  format: Format;
  sourcePath: string | null;
  sourceRevision: Revision | null;
  updatedAt: string;
};
export type RecoveryList = {
  snapshots: RecoverySnapshot[];
  warnings: string[];
};
export type SavePhase = "clean" | "dirty" | "saving" | "conflict" | "error";
export type Session = SessionKey & {
  path: string | null;
  format: Format;
  readOnly: boolean;
  version: number;
  persistedVersion: number;
  revision: Revision | null;
  phase: SavePhase;
  lastDiskEventSeq: number;
  activeRequest: SaveRequest | null;
  error: Failure | null;
  durability: "confirmed" | "uncertain";
};
export function failure(e: unknown): Failure {
  if (typeof e === "object" && e !== null && "message" in e)
    return {
      code: "code" in e ? String(e.code) : "io",
      message: String(e.message),
    };
  return {
    code: "io",
    message: typeof e === "string" ? e : "操作失败，请重试",
  };
}
