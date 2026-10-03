// LAN mode of the booth server. Off unless the Node composition passes a LanOptions (server/lanMode.ts, pnpm demo:lan).
// Then phones on the same Wi-Fi can open the live app and the native shells can connect to it, and a pairing token keeps
// the rest of that network away from the API. Demo plumbing, deliberately small: one random token per start, carried
// in a header (native shells, dev pages) or a cookie (browsers that opened /?t=<token>). Pages on the Mac itself (Host
// and socket both loopback) need no token, as in loopback-only mode. Web-standard APIs only (no node: imports).
import type { Context, Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { LanInfo, WalletStats } from "../../src/api/http/lanInfo";
import { errorBody } from "./errors";
import { isAllowedHost, isLoopbackHostname, isLoopbackOrigin, type OriginVerdict } from "./guards";
import { SESSION_HEADER } from "./sessionWire";

export const TOKEN_HEADER = "x-wally-token";
export const TOKEN_COOKIE = "wally_t";
export const TOKEN_PARAM = "t";
/** Origins of the native shells: iOS capacitor://localhost; Android https://localhost (default) or http://localhost. */
export const NATIVE_ORIGINS: readonly string[] = ["capacitor://localhost", "http://localhost", "https://localhost"];
/** ASSUMED: how long a browser keeps the pairing cookie (the token itself ends with the server process). */
export const COOKIE_MAX_AGE_S = 24 * 60 * 60;

const ALLOWED_REQUEST_HEADERS = "content-type, x-wally-token";
const ALLOWED_METHODS = "GET, POST, OPTIONS";
/** The client waits on X-Event-Seq; a cross-origin page can read it only when it is exposed. */
const EXPOSED_HEADERS = "x-event-seq";
/** ASSUMED: how long a browser may reuse a preflight answer (10 minutes). */
const PREFLIGHT_MAX_AGE_S = "600";

export interface LanOptions {
  /** 128 random bits, hex: new on every server start. */
  readonly token: string;
  /** Host names (no port) the API answers: loopback, this machine's addresses and names. */
  readonly hostAllowed: (hostname: string) => boolean;
  /** Pairing links for /api/lan, the token included. Read per request: the Mac's addresses can change. */
  readonly urls: () => readonly string[];
  /** A QR code for a text, as SVG markup. */
  readonly qrSvg: (text: string) => string;
  /** The socket's peer address; undefined when unknown, which counts as "not loopback" (fail closed). */
  readonly remoteAddress: (c: Context) => string | undefined;
  /** Default NATIVE_ORIGINS. */
  readonly nativeOrigins?: readonly string[];
  /** Private practice wallets are on (server/sessions.ts): the native shells may send X-Wally-Session and read it back. Default off. */
  readonly sessions?: boolean;
  /** WALLY_PUBLIC_URL: the practice copy that works anywhere, shown beside the pairing links on the Mac. Absent: not shown. */
  readonly publicUrl?: string;
  /** Practice wallets on: how they are doing, for the Mac's /api/lan answer. Absent: the answer has no `sessions`. */
  readonly walletStats?: () => WalletStats;
}

/** 128 random bits as 32 hex characters. */
export function newPairingToken(fill: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer> = (bytes) => globalThis.crypto.getRandomValues(bytes)): string {
  return Array.from(fill(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares in time that depends on the longer length only, never on where the strings differ. */
export function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** 127.0.0.0/8, ::1 and the IPv4-mapped form of the first. */
export function isLoopbackAddress(address: string | undefined): boolean {
  if (address === undefined) return false;
  const a = address.toLowerCase();
  return a === "::1" || /^(::ffff:)?127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(a);
}

function hostOf(c: Context): string | undefined {
  const header = c.req.header("host");
  if (header !== undefined) return header;
  try {
    return new URL(c.req.url).host;
  } catch {
    return undefined;
  }
}

function sameOrigin(origin: string, host: string | undefined): boolean {
  if (host === undefined) return false;
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin === origin && url.host === host.toLowerCase();
  } catch {
    return false;
  }
}

/** A page on the Mac itself: loopback Host and a loopback peer. */
export function isLocalClient(c: Context, lan: LanOptions): boolean {
  return isAllowedHost(hostOf(c), isLoopbackHostname) && isLoopbackAddress(lan.remoteAddress(c));
}

/**
 * POST Origin in LAN mode: this page's own address, a loopback page on the Mac, or a native shell (whose requests are
 * cross-site by nature, so Sec-Fetch-Site does not count for them). A foreign Origin or a cross-site fetch is refused.
 */
export function lanPostOrigin(c: Context, lan: LanOptions): OriginVerdict {
  const origin = c.req.header("origin");
  if (origin !== undefined && (lan.nativeOrigins ?? NATIVE_ORIGINS).includes(origin)) return "ok";
  if (c.req.header("sec-fetch-site")?.toLowerCase() === "cross-site") return "cross_site";
  if (origin === undefined) return "ok";
  return isLoopbackOrigin(origin) || sameOrigin(origin, hostOf(c)) ? "ok" : "foreign_origin";
}

function hasToken(c: Context, token: string): boolean {
  const candidates = [c.req.header(TOKEN_HEADER), getCookie(c, TOKEN_COOKIE)];
  return candidates.some((given) => given !== undefined && constantTimeEqual(given, token));
}

const refuse = (c: Context, status: 401 | 403 | 404, code: string, message: string): Response => c.json(errorBody(code, message), status);

/** The request and response headers the native shells use, plus the wallet id header when practice wallets are on. */
const withSessionHeader = (list: string, lan: LanOptions): string => (lan.sessions === true ? `${list}, ${SESSION_HEADER}` : list);

/** Echoes one allowlisted native origin (never a wildcard) and exposes the headers the client reads. */
function allowCors(c: Context, origin: string, lan: LanOptions): void {
  c.res.headers.set("access-control-allow-origin", origin);
  c.res.headers.append("vary", "Origin");
  c.res.headers.set("access-control-expose-headers", withSessionHeader(EXPOSED_HEADERS, lan));
}

function preflight(origin: string, lan: LanOptions): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": ALLOWED_METHODS,
      "access-control-allow-headers": withSessionHeader(ALLOWED_REQUEST_HEADERS, lan),
      "access-control-max-age": PREFLIGHT_MAX_AGE_S,
      // Chrome and Android WebView ask this of a preflight that goes to a private address (Private Network Access).
      "access-control-allow-private-network": "true",
      vary: "Origin",
    },
  });
}

/** /?t=<token> on a page path: set the cookie when the token is right, then redirect without it. Other requests pass. */
async function pairWithLink(c: Context, next: () => Promise<void>, lan: LanOptions): Promise<Response | void> {
  const asksToPair = (c.req.method === "GET" || c.req.method === "HEAD") && !c.req.path.startsWith("/api/");
  if (!asksToPair) return next();
  const url = new URL(c.req.url);
  const given = url.searchParams.get(TOKEN_PARAM);
  if (given === null || !isAllowedHost(hostOf(c), lan.hostAllowed)) return next();
  if (constantTimeEqual(given, lan.token)) {
    setCookie(c, TOKEN_COOKIE, lan.token, { httpOnly: true, sameSite: "Strict", path: "/", maxAge: COOKIE_MAX_AGE_S });
  }
  url.searchParams.delete(TOKEN_PARAM);
  c.header("cache-control", "no-store");
  c.header("referrer-policy", "no-referrer");
  // A leading "//" would be read as another host: the redirect always stays on this one.
  return c.redirect(`/${url.pathname.replace(/^\/+/, "")}${url.search}`, 302);
}

export function registerLan(app: Hono, lan: LanOptions): void {
  const natives = lan.nativeOrigins ?? NATIVE_ORIGINS;
  app.use("*", (c, next) => pairWithLink(c, next, lan));

  app.use("/api/*", async (c, next) => {
    if (!isAllowedHost(hostOf(c), lan.hostAllowed)) return refuse(c, 403, "FORBIDDEN_HOST", "this API answers this machine's own addresses and names only");
    const origin = c.req.header("origin");
    const native = origin !== undefined && natives.includes(origin) ? origin : null;
    if (native !== null) allowCors(c, native, lan);
    if (c.req.method === "OPTIONS") {
      return native === null ? refuse(c, 403, "FORBIDDEN_ORIGIN", "this API accepts requests from its own pages and the Wally app only") : preflight(native, lan);
    }
    // /api/lan answers (or says 404) by where the request comes from, so the token is not asked for there.
    const open = c.req.path === "/api/health" || c.req.path === "/api/lan" || isLocalClient(c, lan);
    if (!open && !hasToken(c, lan.token)) return refuse(c, 401, "UNAUTHORIZED", "pairing needed: open the link or scan the QR code shown on the booth screen");
    return next();
  });

  // Only a page on the Mac itself may ask who can reach it and with which token; for everyone else it does not exist.
  app.get("/api/lan", (c) => {
    if (!isLocalClient(c, lan)) return refuse(c, 404, "NOT_FOUND", "no such API route");
    const urls = lan.urls();
    const body: LanInfo = {
      lan: true,
      token: lan.token,
      urls,
      qrSvg: urls.map((url) => lan.qrSvg(url)),
      ...(lan.publicUrl === undefined ? {} : { publicUrl: lan.publicUrl, publicQrSvg: lan.qrSvg(lan.publicUrl) }),
      ...(lan.walletStats === undefined ? {} : { sessions: lan.walletStats() }),
    };
    c.header("cache-control", "no-store");
    return c.json(body);
  });
}
