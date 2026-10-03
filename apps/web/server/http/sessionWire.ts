// How a visitor's private practice wallet is named on the wire. A leaf module (no imports): http/lan.ts, sessions.ts and
// sessionScope.ts all read these names, and none of them may import another for them. Web-standard APIs only.

/** The cookie a browser keeps its wallet id in (HttpOnly, SameSite=Strict, set once, when the wallet is made). */
export const SESSION_COOKIE = "wally_s";
/**
 * The same id as a header, for clients that cannot keep a cookie: the native shells (their pages are cross-origin) and
 * scripts. A request that carries it, or that comes from a native shell's origin, is told its id in this header too.
 */
export const SESSION_HEADER = "x-wally-session";
/** 128 random bits as 32 lower-case hex characters, the same shape as the pairing token. */
export const SESSION_ID_RE = /^[0-9a-f]{32}$/;
/** ASSUMED: how long a browser keeps the cookie. The wallet itself is dropped after 45 idle minutes (sessions.ts), so this only bounds a dead cookie. */
export const SESSION_COOKIE_MAX_AGE_S = 24 * 60 * 60;

/** 128 random bits as 32 hex characters. `fill` is replaced in tests. */
export function newSessionId(fill: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer> = (bytes) => globalThis.crypto.getRandomValues(bytes)): string {
  return Array.from(fill(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The id when `raw` has the shape of one, else null. Whether a wallet exists for it is the registry's question. */
export function sessionIdFrom(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  return SESSION_ID_RE.test(trimmed) ? trimmed : null;
}
