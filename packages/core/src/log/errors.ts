export type LogErrorCode =
  | "LOG_ID"
  | "SEQ"
  | "PREV_HASH"
  | "KIND"
  | "SCHEMA"
  | "CARD_DATA"
  | "CLOCK"
  | "HEAD"
  | "CORRUPT"
  | "LIMIT"
  | "INTEGRITY"
  | "PERMISSIONS";

/** A refused append or an unreadable log. Callers fail closed (I5): no entry means no side effect (I7). */
export class LogError extends Error {
  readonly code: LogErrorCode;

  constructor(code: LogErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "LogError";
    this.code = code;
  }
}
