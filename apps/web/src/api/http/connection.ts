// Where a page keeps its booth connection, and how a pasted pairing link is read. The pairing token lives in session
// storage (a browser page) or, with the booth Mac's address, in local storage (the native shell, so a relaunch stays
// connected). Storage can throw (private mode, blocked data): every access is guarded and a failure reads as "not set".
// Plain TypeScript, no React and no node: imports.

export const TOKEN_KEY = "wally:token";
export const SERVER_KEY = "wally:server";
/** Request header the booth server reads (server/http/lan.ts). */
export const TOKEN_HEADER = "X-Wally-Token";
const TOKEN_PARAM = "t";
/** The server makes 32 hex characters; this accepts any URL-safe token of a sane length. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{8,128}$/;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface ConnectionStores {
  readonly local: Store | null;
  readonly session: Store | null;
}

export function browserStores(): ConnectionStores {
  try {
    return { local: window.localStorage, session: window.sessionStorage };
  } catch {
    return { local: null, session: null };
  }
}

function read(store: Store | null, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(store: Store | null, key: string, value: string): void {
  try {
    store?.setItem(key, value);
  } catch {
    // Blocked storage: the connection lasts for this page only.
  }
}

function drop(store: Store | null, key: string): void {
  try {
    store?.removeItem(key);
  } catch {
    // Nothing to remove.
  }
}

// ---- Reading a pairing link ------------------------------------------------------------------------------------

/** Hosts a booth Mac can have: loopback, RFC 1918, link-local, *.local (Bonjour), IPv6 loopback, unique-local and link-local. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return host !== ".local";
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4 !== null) {
    const [a = 0, b = 0, ...rest] = v4.slice(1).map(Number);
    if ([a, b, ...rest].some((octet) => octet > 255)) return false;
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (host.includes(":")) return host === "::1" || /^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host);
  return false;
}

export type LinkProblem = "empty" | "not_url" | "scheme" | "credentials" | "host" | "token";

export type BoothLink = { readonly ok: true; readonly server: string; readonly token: string | null } | { readonly ok: false; readonly problem: LinkProblem };

/**
 * The booth Mac and the pairing token in a link the server printed or showed as a QR code (http://192.168.0.6:8787/?t=...).
 * A bare "192.168.0.6:8787" is read as http. Only a private-network or .local host is accepted: this app would otherwise
 * send its token to whatever address a pasted text names.
 */
export function parseBoothLink(text: string): BoothLink {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, problem: "empty" };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`);
  } catch {
    return { ok: false, problem: "not_url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, problem: "scheme" };
  if (url.username !== "" || url.password !== "") return { ok: false, problem: "credentials" };
  if (!isPrivateHost(url.hostname)) return { ok: false, problem: "host" };
  const token = url.searchParams.get(TOKEN_PARAM);
  if (token !== null && !TOKEN_SHAPE.test(token)) return { ok: false, problem: "token" };
  return { ok: true, server: url.origin, token };
}

// ---- Stored connection -----------------------------------------------------------------------------------------

/** The pairing token this page holds: session storage first (a browser page), then local storage (the native shell). */
export function readToken(stores: ConnectionStores = browserStores()): string | null {
  const found = read(stores.session, TOKEN_KEY) ?? read(stores.local, TOKEN_KEY);
  return found !== null && TOKEN_SHAPE.test(found) ? found : null;
}

/** The booth Mac a native shell saved, checked again on every read (storage is not trusted). */
export function readServer(stores: ConnectionStores = browserStores()): string | null {
  const found = read(stores.local, SERVER_KEY);
  if (found === null) return null;
  const link = parseBoothLink(found);
  return link.ok ? link.server : null;
}

/** A page whose address carried ?t=<token> (a dev server in front of the booth server): keep the token for this tab and clean the address. */
export function captureTokenFromUrl(
  where: { readonly search: string; readonly pathname: string; readonly hash: string } = window.location,
  history: Pick<History, "replaceState"> = window.history,
  stores: ConnectionStores = browserStores(),
): boolean {
  const params = new URLSearchParams(where.search);
  const given = params.get(TOKEN_PARAM);
  if (given === null) return false;
  if (TOKEN_SHAPE.test(given)) write(stores.session, TOKEN_KEY, given);
  params.delete(TOKEN_PARAM);
  const rest = params.toString();
  history.replaceState(null, "", `${where.pathname}${rest === "" ? "" : `?${rest}`}${where.hash}`);
  return true;
}

/** The native shell's "Connect": the server and the token stay across launches. */
export function saveConnection(link: { readonly server: string; readonly token: string | null }, stores: ConnectionStores = browserStores()): void {
  write(stores.local, SERVER_KEY, link.server);
  if (link.token === null) drop(stores.local, TOKEN_KEY);
  else write(stores.local, TOKEN_KEY, link.token);
  drop(stores.session, TOKEN_KEY);
}

/** The native shell's "Disconnect": back to on-device mode on the next load. */
export function clearConnection(stores: ConnectionStores = browserStores()): void {
  drop(stores.local, SERVER_KEY);
  drop(stores.local, TOKEN_KEY);
  drop(stores.session, TOKEN_KEY);
}
