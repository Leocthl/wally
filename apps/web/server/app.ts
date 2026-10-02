// Hono app for the booth: the API under /api (http/routes.ts) and, when given, the built UI at / and the offline
// verifier page at /verifier/ (static.ts). No feature logic here: the backend does the work.
import { Hono } from "hono";
import type { BoothBackend } from "./backend";
import { BoothError, errorBody } from "./http/errors";
import { errorResponse, registerApiRoutes, SILENT_LOGGER, type Logger } from "./http/routes";
import { SseHub } from "./http/sse";
import { registerStaticRoutes, type StaticRoots } from "./static";

/**
 * ASSUMED: request body cap. The largest real body is a visitor listing of MAX_LISTING_TEXT_CHARS characters; JSON
 * escapes at most 6 bytes per UTF-16 unit (\uXXXX), so 20,000 characters fit in 120,000 bytes plus the envelope.
 */
export const MAX_BODY_BYTES = 128 * 1024;
/**
 * ASSUMED: longest "Try to trick the agent" text. Large enough for a padding attack (Laya keeps about 940 state tokens
 * per row and drops the rest [F26], a few thousand characters), well under the judge adapter's 50,000-character state
 * limit [F54], and equal to the UI's own cap (LISTING_TEXT_HARD_CAP in src/booth/scenarios.ts).
 */
export const MAX_LISTING_TEXT_CHARS = 20_000;

export interface HttpAppOptions {
  readonly backend: () => BoothBackend;
  readonly hub: SseHub;
  readonly logger?: Logger;
  readonly maxBodyBytes?: number;
  readonly maxListingTextChars?: number;
  readonly staticRoots?: StaticRoots;
}

export function createHttpApp(opts: HttpAppOptions): Hono {
  const logger = opts.logger ?? SILENT_LOGGER;
  const app = new Hono();
  registerApiRoutes(app, {
    backend: opts.backend,
    hub: opts.hub,
    logger,
    maxBodyBytes: opts.maxBodyBytes ?? MAX_BODY_BYTES,
    maxListingTextChars: opts.maxListingTextChars ?? MAX_LISTING_TEXT_CHARS,
  });
  if (opts.staticRoots !== undefined) registerStaticRoutes(app, opts.staticRoots);
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
  getLog: notComposed,
  verify: notComposed,
  tamper: notComposed,
  restore: notComposed,
  reset: notComposed,
  exportLog: notComposed,
  subscribe: () => () => undefined,
};

/** Scaffold entry (smoke test): the routes with no backend composed; /api/health still answers. */
export function createApp(): Hono {
  return createHttpApp({ backend: () => NOT_COMPOSED_BACKEND, hub: new SseHub({ keepAliveMs: 15_000, maxQueuedChunks: 16 }) });
}
