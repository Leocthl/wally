// Expected failures of the booth backend. The Node server turns them into JSON { error: { code, message } } with this
// status (server/http/errors.ts); the on-device client throws them to the UI as they are. Anything else is unexpected.

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

export const badRequest = (code: string, message: string): BoothError => new BoothError(400, code, message);
