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
import { isTokenExempt, NATIVE_ORIGINS } from "./http/lan";
import { SESSION_COOKIE, SESSION_COOKIE_MAX_AGE_S, SESSION_HEADER, sessionIdFrom } from "./http/sessionWire";
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

/**
 * What else a stand-in answers besides reading a property. `in` asks the current wallet (and fails outside a scope like any
 * read); writing, deleting and listing keys are refused loudly, so nothing can quietly see an empty object or change one.
 */
function standInRules<T extends object>(current: () => Active, part: (active: Active) => object): Pick<ProxyHandler<T>, "has" | "ownKeys" | "set" | "defineProperty" | "deleteProperty"> {
  const refuse = (): never => {
    throw new TypeError("the stand-in for the current wallet is read through its methods only");
  };
  return { has: (_unused, prop) => prop in part(current()), ownKeys: refuse, set: refuse, defineProperty: refuse, deleteProperty: refuse };
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

  const backend = new Proxy<BoothBackend>({} as BoothBackend, {
    ...standInRules<BoothBackend>(current, (active) => active.backend),
    get(_unused, prop) {
      const active = current();
      if (prop === "info") return async (): Promise<ApiInfo> => describeWallet(await active.backend.info(), active.kind);
      return bound(active.backend, prop);
    },
  });
  const hub = new Proxy<SseHub>({} as SseHub, { ...standInRules<SseHub>(current, (active) => active.hub), get: (_unused, prop) => bound(current().hub, prop) });

  /** A browser gets its id as a cookie, once. A client that cannot keep one (a native shell, a script) is told it in a header too. */
  const introduce = (c: Context, id: string, presented: string | null, asked: boolean): void => {
    if (presented !== id) setCookie(c, SESSION_COOKIE, id, { httpOnly: true, sameSite: "Strict", path: "/", maxAge: SESSION_COOKIE_MAX_AGE_S });
    const origin = c.req.header("origin");
    if (asked || (origin !== undefined && natives.includes(origin))) c.header(SESSION_HEADER, id);
  };

  const around = async (c: Context, next: () => Promise<void>): Promise<Response | void> => {
    if (isTokenExempt(c.req.path)) return next(); // global, and not behind the token: it makes no wallet, whatever the method
    const mac = opts.isBooth(c);
    // A HEAD runs the GET handler and throws the body away, so it would register an event client that nobody ever closes.
    if (!mac && c.req.method === "HEAD") return c.body(null, 405, { allow: "GET, POST" });
    const header = c.req.header(SESSION_HEADER);
    // The header wins over the cookie when it is an id; "new" (or anything else) only asks to be told the id.
    const presented = sessionIdFrom(header) ?? sessionIdFrom(getCookie(c, SESSION_COOKIE));
    const found = await opts.registry.resolve({ booth: mac, presented });
    if (found.kind === "booth") return scope.run({ ...found.scope, kind: "shared" }, () => next());
    await scope.run({ ...found.scope, kind: "private" }, () => next());
    introduce(c, found.id, presented, header !== undefined);
  };

  return { backend, hub, around };
}
