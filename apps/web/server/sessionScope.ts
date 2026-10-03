// Which wallet an API request runs against. Before the routes run, the request is matched to a wallet (the booth Mac's
// shared one, or the visitor's own, made on the spot) and the rest of the request runs inside that wallet's scope. The
// routes are not changed and do not know: they call "the backend" and "the hub", and those two objects stand in for the
// wallet the current request belongs to (an AsyncLocalStorage holds it). So a route added later is per-wallet without a
// line of session code, and a call made outside any scope throws instead of quietly using the booth's wallet.
// The pairing token, Host and Origin guards have already passed when this runs (http/routes.ts), so a refused request
// never makes a wallet. /api/health is global. Node only (node:async_hooks); http/* stays web-standard.
import { AsyncLocalStorage } from "node:async_hooks";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { ApiInfo } from "../src/api/types";
import type { BoothBackend } from "./backend";
import { BoothError } from "./http/errors";
import { NATIVE_ORIGINS } from "./http/lan";
import { SESSION_COOKIE, SESSION_COOKIE_MAX_AGE_S, SESSION_HEADER } from "./http/sessionWire";
import type { SseHub } from "./http/sse";
import type { SessionRegistry, SessionScope } from "./sessions";

/** Said in /api/info.keys for a visitor: the booth's own text is about KEY_DIR, which a visitor's keys never touch. */
export const PRACTICE_KEYS_NOTE = "Practice wallet: demo keys made for this visit (rail SIMULATED), gone when the wallet is dropped.";

type WalletKind = "shared" | "private";

interface Active extends SessionScope {
  readonly kind: WalletKind;
}

export interface SessionLayer {
  /** Stands in for the current request's wallet. Give it to the routes as their backend. */
  readonly backend: BoothBackend;
  /** Stands in for the current request's event hub. Give it to the routes as their hub. */
  readonly hub: SseHub;
  /** The `around` option of the HTTP app. */
  readonly around: (c: Context, next: () => Promise<void>) => Promise<Response | void>;
}

export interface SessionLayerOptions {
  readonly registry: SessionRegistry;
  /** The page on the booth Mac: Host and socket peer both loopback (http/lan.ts isLocalClient). Without LAN mode every caller is the Mac. */
  readonly isBooth: (c: Context) => boolean;
  /** Origins of the native shells; they are told their wallet id in a header, as they keep no cookie. Default NATIVE_ORIGINS. */
  readonly nativeOrigins?: readonly string[];
}

/** The property of `target`, with methods bound to it (the wallet and the hub keep their state in #private fields). */
function bound(target: object, prop: string | symbol): unknown {
  const value: unknown = Reflect.get(target, prop, target);
  return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
}

type InfoWithKeys = ApiInfo & { readonly keys?: string };

/** /api/info says whose wallet this is, so the app can say so: the Mac's is shared, a phone's is its own. */
function describeWallet(info: ApiInfo, kind: WalletKind): ApiInfo {
  if (kind === "shared") return { ...info, sessions: "shared" };
  const own: InfoWithKeys = { ...info, sessions: "private", keys: PRACTICE_KEYS_NOTE };
  return own;
}

export function createSessionLayer(opts: SessionLayerOptions): SessionLayer {
  const scope = new AsyncLocalStorage<Active>();
  const natives = opts.nativeOrigins ?? NATIVE_ORIGINS;

  const current = (): Active => {
    const found = scope.getStore();
    if (found === undefined) throw new BoothError(500, "NO_WALLET_SCOPE", "this request has no wallet (fail closed: nothing was done)");
    return found;
  };

  const backend = new Proxy({} as BoothBackend, {
    get(_unused, prop) {
      const active = current();
      if (prop === "info") return async (): Promise<ApiInfo> => describeWallet(await active.backend.info(), active.kind);
      return bound(active.backend, prop);
    },
  });
  const hub = new Proxy({} as SseHub, { get: (_unused, prop) => bound(current().hub, prop) });

  /** A browser gets its id as a cookie, once. A client that cannot keep one (a native shell, a script) is told it in a header too. */
  const introduce = (c: Context, id: string, presented: string | null, asked: boolean): void => {
    if (presented !== id) setCookie(c, SESSION_COOKIE, id, { httpOnly: true, sameSite: "Strict", path: "/", maxAge: SESSION_COOKIE_MAX_AGE_S });
    const origin = c.req.header("origin");
    if (asked || (origin !== undefined && natives.includes(origin))) c.header(SESSION_HEADER, id);
  };

  const around = async (c: Context, next: () => Promise<void>): Promise<Response | void> => {
    if (c.req.path === "/api/health") return next();
    const header = c.req.header(SESSION_HEADER);
    const presented = header ?? getCookie(c, SESSION_COOKIE) ?? null; // the header wins: it is the explicit one
    const found = await opts.registry.resolve({ booth: opts.isBooth(c), presented });
    if (found.kind === "booth") return scope.run({ ...found.scope, kind: "shared" }, () => next());
    await scope.run({ ...found.scope, kind: "private" }, () => next());
    introduce(c, found.id, presented, header !== undefined);
  };

  return { backend, hub, around };
}
