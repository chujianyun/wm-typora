import type {
  Session,
  Opened,
  SaveReply,
  SaveRequest,
  DiskEvent,
} from "./protocol";
export type SessionEvent =
  | { type: "edited"; version: number }
  | { type: "saveStarted"; request: SaveRequest }
  | { type: "saveFinished"; reply: SaveReply }
  | { type: "diskChanged"; event: DiskEvent };
export function fromOpened(o: Opened): Session {
  const { text: _text, ...meta } = o;
  return {
    ...meta,
    version: 0,
    persistedVersion: 0,
    phase: "clean",
    lastDiskEventSeq: 0,
    activeRequest: null,
    error: null,
    durability: "confirmed",
  };
}
export function reduceSession(s: Session, e: SessionEvent): Session {
  if (e.type === "edited") {
    if (e.version <= s.version || s.readOnly) return s;
    return {
      ...s,
      version: e.version,
      phase:
        s.phase === "conflict" || s.phase === "error"
          ? s.phase
          : s.activeRequest
            ? "saving"
            : "dirty",
    };
  }
  if (e.type === "diskChanged") {
    const d = e.event;
    if (
      d.sessionId !== s.sessionId ||
      d.epoch !== s.epoch ||
      d.eventSeq <= s.lastDiskEventSeq
    )
      return s;
    return { ...s, lastDiskEventSeq: d.eventSeq, phase: "conflict" };
  }
  if (e.type === "saveStarted") {
    const q = e.request;
    if (
      s.activeRequest ||
      q.sessionId !== s.sessionId ||
      q.epoch !== s.epoch ||
      q.version !== s.version
    )
      return s;
    return {
      ...s,
      activeRequest: q,
      phase: s.phase === "conflict" ? "conflict" : "saving",
      error: null,
    };
  }
  const r = e.reply,
    a = s.activeRequest;
  if (
    !a ||
    r.sessionId !== s.sessionId ||
    r.epoch !== s.epoch ||
    r.requestId !== a.requestId ||
    r.version !== a.version
  )
    return s;
  if (r.kind === "failed")
    return {
      ...s,
      activeRequest: null,
      phase: s.phase === "conflict" ? "conflict" : "error",
      error: r.error,
    };
  if (r.kind === "conflict")
    return { ...s, activeRequest: null, phase: "conflict" };
  const uncertain = r.durability === "uncertain";
  return {
    ...s,
    activeRequest: null,
    persistedVersion: r.version,
    revision: r.revision,
    durability: r.durability,
    phase:
      s.phase === "conflict"
        ? "conflict"
        : uncertain
          ? "error"
          : s.version === r.version
            ? "clean"
            : "dirty",
    error: uncertain
      ? {
          code: "durability",
          message: "文件已写入，持久性未确认。请检查磁盘或另存为。",
        }
      : null,
  };
}
