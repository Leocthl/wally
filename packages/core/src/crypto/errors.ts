/** Bad crypto input (encoding, key, canonical JSON). Messages never contain key material (I8). */
export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CryptoError";
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Text cut to at most maxChars characters, marked with an ellipsis when cut (bounded error details). */
export function clipMessage(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}
