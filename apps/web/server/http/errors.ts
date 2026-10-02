// Error shape of the booth API: always JSON { error: { code, message } } with a 4xx/5xx status, never HTML and
// never a stack trace. Backends throw BoothError for expected failures; anything else becomes 500 INTERNAL.

export type BoothErrorStatus = 400 | 403 | 404 | 405 | 409 | 413 | 415 | 422 | 500 | 503;

export class BoothError extends Error {
  readonly status: BoothErrorStatus;
  readonly code: string;

  constructor(status: BoothErrorStatus, code: string, message: string) {
    super(message);
    this.name = "BoothError";
    this.status = status;
    this.code = code;
  }
}

export interface ErrorBody {
  readonly error: { readonly code: string; readonly message: string };
}

/** Longest message we echo to a client; longer ones are clipped so nothing large or internal leaks. */
const MAX_MESSAGE_CHARS = 300;

export function errorBody(code: string, message: string): ErrorBody {
  return { error: { code, message: message.slice(0, MAX_MESSAGE_CHARS) } };
}

export const badRequest = (code: string, message: string): BoothError => new BoothError(400, code, message);
