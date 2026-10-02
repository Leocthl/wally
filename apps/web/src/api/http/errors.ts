// Typed errors for the HTTP client. The server answers { error: { code, message } }; a network failure or an
// answer in any other shape gets a code of its own, so the UI can always show a message instead of freezing.

export type ApiErrorCode = "NETWORK" | "TIMEOUT" | "BAD_RESPONSE" | (string & {});

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  /** The facts behind the code when the server sent them (EXCEEDS_PARENT: { field, requested, allowed }). */
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(status: number, code: ApiErrorCode, message: string, details?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Reads the server's error body; anything unexpected becomes a generic message with the HTTP status. */
export function errorFromBody(status: number, body: unknown): ApiRequestError {
  const err = isRecord(body) ? body["error"] : undefined;
  if (isRecord(err) && typeof err["code"] === "string" && typeof err["message"] === "string") {
    const details = err["details"];
    return new ApiRequestError(status, err["code"], err["message"], isRecord(details) ? details : undefined);
  }
  return new ApiRequestError(status, `HTTP_${status}`, `The booth server answered ${status}.`);
}
