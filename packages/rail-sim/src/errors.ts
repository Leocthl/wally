// Errors the SIMULATED rail throws besides MintError (which core defines for RailPort.mint).
// Declines are events, never errors. These cover malformed requests and operations that make no sense.

export type RailSimErrorCode =
  | "INVALID_CONFIG"
  | "INVALID_REQUEST"
  | "UNKNOWN_CARD"
  | "NOT_ACTIVE"
  | "IDEMPOTENCY_KEY_REUSED"
  | "INTERNAL";

export class RailSimError extends Error {
  readonly code: RailSimErrorCode;

  constructor(code: RailSimErrorCode, message: string) {
    super(`SIMULATED rail: ${message}`);
    this.name = "RailSimError";
    this.code = code;
  }
}
