// Error shape of the booth API: always JSON { error: { code, message } } with a 4xx/5xx status, never HTML and
// never a stack trace. Backends throw BoothError for expected failures; anything else becomes 500 INTERNAL.
// BoothError lives with the portable backend (src/booth/backend/errors.ts), which the on-device client runs too.
export { badRequest, BoothError, type BoothErrorStatus } from "../../src/booth/backend/errors";

export interface ErrorBody {
  readonly error: { readonly code: string; readonly message: string; readonly details?: Readonly<Record<string, unknown>> };
}

/** Longest message we echo to a client; longer ones are clipped so nothing large or internal leaks. */
const MAX_MESSAGE_CHARS = 300;

export function errorBody(code: string, message: string, details?: Readonly<Record<string, unknown>>): ErrorBody {
  return { error: { code, message: message.slice(0, MAX_MESSAGE_CHARS), ...(details === undefined ? {} : { details }) } };
}
