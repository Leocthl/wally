// Hono app for the booth: the API under /api (http/routes.ts) plus optional extra routes (the Node composition adds
// the built UI and the verifier page, static.ts). No feature logic here: the backend does the work. This file and
// http/* use web-standard APIs only (no node: imports), so a browser "local mode" can reuse them later.
import { Hono } from "hono";
import type { BoothBackend } from "./backend";
import { BoothError, errorBody } from "./http/errors";
import { registerLan, type LanOptions } from "./http/lan";
import { errorResponse, registerApiRoutes, SILENT_LOGGER, type Logger, type RouteOptions } from "./http/routes";
import { SseHub } from "./http/sse";
import { MAX_SEE_BODY_BYTES } from "./http/validate";
import { LISTING_TEXT_HARD_CAP } from "../src/booth/scenarios";

/**
 * ASSUMED: request body cap. The largest real body is a visitor listing of MAX_LISTING_TEXT_CHARS characters; JSON
 * escapes at most 6 bytes per UTF-16 unit (\uXXXX), so 4,000 characters fit in 24,000 bytes plus the envelope.
 */
export const MAX_BODY_BYTES = 128 * 1024;
/**
 * Longest "Try to trick the agent" text: the listing record's own text limit (schemas/listing-record.schema.json, 4,000
 * characters), the one constant the page and the on-device client use too (LISTING_TEXT_HARD_CAP in src/booth/scenarios.ts).
 * Still enough for a padding attack (Laya keeps about 940 state tokens per row and drops the rest [F26], a few thousand
 * characters), and a longer text is a calm 400 TEXT_TOO_LONG here instead of a run the listing check would end.
 */
export const MAX_LISTING_TEXT_CHARS = LISTING_TEXT_HARD_CAP;

export interface HttpAppOptions {
  readonly backend: () => BoothBackend;
  readonly hub: SseHub;
  readonly logger?: Logger;
  readonly maxBodyBytes?: number;
  /** Default MAX_SEE_BODY_BYTES: the base64 of a 6 MB picture and a little more. */
  readonly maxSeeBodyBytes?: number;
  readonly maxListingTextChars?: number;
  /** Which Host names the API answers. Default: loopback only; LAN mode widens it to this machine's addresses and names. */
  readonly hostAllowed?: (hostname: string) => boolean;
  /** LAN mode (http/lan.ts, server/lanMode.ts): pairing token, Origin and CORS rules for phones. Off by default. */
  readonly lan?: LanOptions;
  /** Runs the rest of every /api request in a scope of its own, e.g. a visitor's private wallet (server/sessionScope.ts). */
  readonly around?: RouteOptions["around"];
  /** Registered after the API routes, e.g. static files (Node composition only). */
  readonly extraRoutes?: (app: Hono) => void;
}

export function createHttpApp(opts: HttpAppOptions): Hono {
  const logger = opts.logger ?? SILENT_LOGGER;
  const app = new Hono();
  if (opts.lan !== undefined) registerLan(app, opts.lan);
  const hostAllowed = opts.lan?.hostAllowed ?? opts.hostAllowed;
  registerApiRoutes(app, {
    backend: opts.backend,
    hub: opts.hub,
    logger,
    maxBodyBytes: opts.maxBodyBytes ?? MAX_BODY_BYTES,
    maxSeeBodyBytes: opts.maxSeeBodyBytes ?? MAX_SEE_BODY_BYTES,
    maxListingTextChars: opts.maxListingTextChars ?? MAX_LISTING_TEXT_CHARS,
    ...(hostAllowed === undefined ? {} : { hostAllowed }),
    ...(opts.lan === undefined ? {} : { lan: opts.lan }),
    ...(opts.around === undefined ? {} : { around: opts.around }),
  });
  opts.extraRoutes?.(app);
  app.notFound((c) => c.json(errorBody("NOT_FOUND", "not found"), 404));
  app.onError((err, c) => errorResponse(err, c, logger));
  return app;
}

const notComposed = (): Promise<never> => Promise.reject(new BoothError(503, "NOT_READY", "the booth backend is not composed"));

/** A backend that answers 503 to every booth call: the routes alone, before composition. */
export const NOT_COMPOSED_BACKEND: BoothBackend = {
  info: notComposed,
  snapshot: notComposed,
  seal: notComposed,
  runScenario: notComposed,
  propose: notComposed,
  revoke: notComposed,
  answerEscalation: notComposed,
  ask: notComposed,
  suggestAlternatives: notComposed,
  compileRules: notComposed,
  see: notComposed,
  getLog: notComposed,
  verify: notComposed,
  tamper: notComposed,
  restore: notComposed,
  reset: notComposed,
  exportLog: notComposed,
  family: notComposed,
  subscribe: () => () => undefined,
};

/** Scaffold entry (smoke test): the routes with no backend composed; /api/health still answers. */
export function createApp(): Hono {
  return createHttpApp({ backend: () => NOT_COMPOSED_BACKEND, hub: new SseHub({ keepAliveMs: 15_000, maxQueuedChunks: 16 }) });
}
