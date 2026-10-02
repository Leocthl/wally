// Hash routes without a dependency: the booth works from a static file and a phone browser with no server.
// One table for the whole app (lane b-shell). Other screens read their params with useRoute() or useRouteParam(), and
// move with navigate() or a plain <a href={routeHref(...)}>.
import { useCallback, useEffect, useSyncExternalStore } from "react";

export const ROUTE_NAMES = ["budget", "wally", "receipts", "proof", "seal", "evidence", "presenter", "styleguide"] as const;
export type RouteName = (typeof ROUTE_NAMES)[number];

/** Same screen under another name, kept as typed (#/ and the first booth UI's #/booth both show Budget). */
const ALIASES: Readonly<Record<string, RouteName>> = { "": "budget", booth: "budget" };

/** First-UI routes that moved: the address is replaced (no extra history entry) by the new route. */
export const LEGACY_REDIRECTS: Readonly<Record<string, { readonly name: RouteName; readonly params?: Readonly<Record<string, string>> }>> = {
  run: { name: "wally" },
  console: { name: "budget", params: { focus: "console" } },
  log: { name: "receipts" },
};

export type RouteParams = Readonly<Record<string, string>>;

export interface Route {
  readonly name: RouteName;
  readonly params: RouteParams;
}

export interface ParsedHash {
  readonly route: Route;
  /** The hash to put in the address bar instead (legacy routes), or null. */
  readonly redirect: string | null;
}

/** Query keys the shell itself uses. Screens may add their own keys. */
export const PARAM = {
  /** #/wally?d=<id> and #/receipts?d=<id>: show this decision (Recent rows, the escalation banner, Receipts). */
  decision: "d",
  /** #/budget?focus=console: scroll to the cards and Cancel this budget. */
  focus: "focus",
  /** #/seal?mode=topup|edit: open Seal prefilled from the current rules. */
  mode: "mode",
} as const;

/** The first links used `decision` for the same thing; incoming links with it still work and are rewritten to `d`. */
const DECISION_ALIAS = "decision";
const DECISION_ID = /^[A-Za-z0-9_-]{1,80}$/;

/** The decision id in a route's params (`d`, or the old `decision`), or null when absent or not a plain id (untrusted input). */
export function decisionIdOf(params: RouteParams): string | null {
  const raw = params[PARAM.decision] ?? params[DECISION_ALIAS];
  return raw !== undefined && DECISION_ID.test(raw) ? raw : null;
}

/** Folds the old `decision` key into `d`. `changed` says the address should be rewritten. */
function withDecisionAlias(params: RouteParams): { readonly params: RouteParams; readonly changed: boolean } {
  const alias = params[DECISION_ALIAS];
  if (alias === undefined) return { params, changed: false };
  const rest = Object.fromEntries(Object.entries(params).filter(([key]) => key !== DECISION_ALIAS));
  return { params: PARAM.decision in rest ? rest : { ...rest, [PARAM.decision]: alias }, changed: true };
}

function isRouteName(name: string): name is RouteName {
  return (ROUTE_NAMES as readonly string[]).includes(name);
}

function readParams(query: string): RouteParams {
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(query)) out[k] = v;
  return out;
}

export function routeHref(name: RouteName, params: RouteParams = {}): string {
  const query = new URLSearchParams(Object.entries(params)).toString();
  return `#/${name}${query ? `?${query}` : ""}`;
}

/** "#/wally?d=dec_1" -> wally with { d: "dec_1" } (the old "?decision=dec_1" reads the same). Unknown names fall back to Budget, never a blank page. */
export function parseHash(hash: string): ParsedHash {
  const body = hash.replace(/^#\/?/, "");
  const [path = "", query = ""] = body.split("?", 2);
  const name = (path.split("/")[0] ?? "").toLowerCase();
  const { params, changed } = withDecisionAlias(readParams(query));
  const legacy = LEGACY_REDIRECTS[name];
  if (legacy) {
    const merged = { ...params, ...(legacy.params ?? {}) };
    return { route: { name: legacy.name, params: merged }, redirect: routeHref(legacy.name, merged) };
  }
  if (isRouteName(name)) return { route: { name, params }, redirect: changed ? routeHref(name, params) : null };
  return { route: { name: ALIASES[name] ?? "budget", params }, redirect: null };
}

/** The decision id a hash names, whichever screen it is on; null when none. */
export function decisionIdFromHash(hash: string): string | null {
  return decisionIdOf(parseHash(hash).route.params);
}

/** Where a decision's result lives: Wally's screen pinned to it, and its receipt. */
export function wallyHref(decisionId: string): string {
  return routeHref("wally", { [PARAM.decision]: decisionId });
}

export function receiptHref(decisionId: string): string {
  return routeHref("receipts", { [PARAM.decision]: decisionId });
}

// ---- a tiny store over location.hash, so every reader sees the same Route object until the hash changes ----

const listeners = new Set<() => void>();
let cache: { readonly hash: string; readonly parsed: ParsedHash } | null = null;

function currentHash(): string {
  return typeof window === "undefined" ? "" : window.location.hash;
}

function snapshot(): ParsedHash {
  const hash = currentHash();
  if (cache?.hash !== hash) cache = { hash, parsed: parseHash(hash) };
  return cache.parsed;
}

function notify(): void {
  for (const l of listeners) l();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("hashchange", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("hashchange", onChange);
  };
}

const SERVER_ROUTE: ParsedHash = { route: { name: "budget", params: {} }, redirect: null };

export interface NavigateOptions {
  /** Replace the current history entry (redirects, first-run gating) instead of adding one. */
  readonly replace?: boolean;
}

export function navigate(name: RouteName, params: RouteParams = {}, { replace = false }: NavigateOptions = {}): void {
  const href = routeHref(name, params);
  if (replace) {
    window.history.replaceState(window.history.state, "", href);
    notify();
    return;
  }
  if (window.location.hash === href) return;
  window.location.hash = href;
}

/** The current route. Legacy addresses (#/run, #/console, #/log) render their new screen at once and are replaced. */
export function useRoute(): Route {
  const parsed = useSyncExternalStore(subscribe, snapshot, () => SERVER_ROUTE);
  useEffect(() => {
    if (parsed.redirect === null) return;
    window.history.replaceState(window.history.state, "", parsed.redirect);
    notify();
  }, [parsed.redirect]);
  return parsed.route;
}

export function useRouteParam(key: string): string | null {
  return useRoute().params[key] ?? null;
}

export function useNavigate(): typeof navigate {
  return useCallback<typeof navigate>((name, params, options) => navigate(name, params, options), []);
}
