// HTTP contract of the booth API (Hono). Routes and JSON are exactly the ApiClient types; errors are JSON
// { error: { code, message } }. Guards: loopback Host on every request, loopback Origin and JSON content type on
// every POST, a byte cap on bodies, a character cap on visitor listing text and on typed requests. Mutating responses
// carry X-Event-Seq: the SSE id of the last event they caused, so a client can wait until it has seen them.
import type { Context, Hono } from "hono";
import type { BoothBackend } from "../backend";
import { readJsonObject, type JsonObject } from "./body";
import { BoothError, errorBody, type BoothErrorStatus } from "./errors";
import { checkPostOrigin, isAllowedHost, isJsonContentType, isLoopbackHostname } from "./guards";
import type { SseHub } from "./sse";
import {
  parseAlternativesRequest,
  parseAnswerRequest,
  parseAskRequest,
  parseCompileRequest,
  parseEmptyBody,
  parseProposeRequest,
  parseRevokeRequest,
  parseScenarioId,
  parseSealRequest,
} from "./validate";

export interface Logger {
  info(message: string): void;
  error(message: string): void;
}

export const SILENT_LOGGER: Logger = { info: () => undefined, error: () => undefined };

export interface RouteOptions {
  readonly backend: () => BoothBackend;
  readonly hub: SseHub;
  readonly maxBodyBytes: number;
  readonly maxListingTextChars: number;
  readonly logger: Logger;
  /** Default loopback only. */
  readonly hostAllowed?: (hostname: string) => boolean;
}

export const EVENT_SEQ_HEADER = "x-event-seq";

function fail(c: Context, status: BoothErrorStatus, code: string, message: string): Response {
  return c.json(errorBody(code, message), status);
}

/** Node's server sets Host from the request line; an in-process request (tests) may only have the URL. */
function hostOf(c: Context): string | undefined {
  const header = c.req.header("host");
  if (header !== undefined) return header;
  try {
    return new URL(c.req.url).host;
  } catch {
    return undefined;
  }
}

function guardRequest(c: Context, hostAllowed: (hostname: string) => boolean): Response | null {
  if (!isAllowedHost(hostOf(c), hostAllowed)) return fail(c, 403, "FORBIDDEN_HOST", "this API answers loopback hosts only");
  if (c.req.method !== "POST") return null;
  const verdict = checkPostOrigin(c.req.header("origin"), c.req.header("sec-fetch-site"));
  if (verdict !== "ok") return fail(c, 403, "FORBIDDEN_ORIGIN", "this API accepts requests from this machine's own pages only");
  if (!isJsonContentType(c.req.header("content-type"))) return fail(c, 415, "UNSUPPORTED_MEDIA_TYPE", "content type must be application/json");
  return null;
}

export function registerApiRoutes(app: Hono, opts: RouteOptions): void {
  const { hub } = opts;
  const body = (c: Context): Promise<JsonObject> => readJsonObject(c.req.raw, opts.maxBodyBytes);
  const reply = (c: Context, value: unknown, status: 200 = 200): Response => {
    c.header(EVENT_SEQ_HEADER, String(hub.seq));
    c.header("cache-control", "no-store");
    return c.json(value, status);
  };
  const be = (): BoothBackend => opts.backend();

  app.use("/api/*", async (c, next) => {
    const refused = guardRequest(c, opts.hostAllowed ?? isLoopbackHostname);
    if (refused !== null) return refused;
    return next();
  });

  app.get("/api/health", (c) => c.json({ ok: true, rail: "SIMULATED" }));
  app.get("/api/info", async (c) => reply(c, await be().info()));
  app.get("/api/snapshot", async (c) => reply(c, await be().snapshot()));
  app.get("/api/log", async (c) => reply(c, await be().getLog()));
  app.get("/api/export", async (c) => reply(c, await be().exportLog()));
  app.get("/api/events", () => hub.connect());

  app.post("/api/seal", async (c) => reply(c, await be().seal(parseSealRequest(await body(c)))));
  app.post("/api/scenario/:id", async (c) => {
    const id = parseScenarioId(c.req.param("id"));
    parseEmptyBody(await body(c));
    return reply(c, await be().runScenario(id));
  });
  app.post("/api/propose", async (c) => reply(c, await be().propose(parseProposeRequest(await body(c), opts.maxListingTextChars))));
  app.post("/api/revoke", async (c) => reply(c, await be().revoke(parseRevokeRequest(await body(c)))));
  app.post("/api/escalation/answer", async (c) => reply(c, await be().answerEscalation(parseAnswerRequest(await body(c)))));
  // Ask Wally: a typed request (planner cap [F56] after NFKC) and "See cheaper options" after a budget stop. Both are runs.
  app.post("/api/ask", async (c) => reply(c, await be().ask(parseAskRequest(await body(c)))));
  app.post("/api/alternatives", async (c) => reply(c, await be().suggestAlternatives(parseAlternativesRequest(await body(c)))));
  // Sentence to rule chips. Not a run: no trace events, so no X-Event-Seq; it seals nothing.
  app.post("/api/compile", async (c) => {
    const compiled = await be().compileRules(parseCompileRequest(await body(c)));
    c.header("cache-control", "no-store");
    return c.json(compiled);
  });
  app.post("/api/verify", async (c) => {
    parseEmptyBody(await body(c));
    return reply(c, await be().verify());
  });
  app.post("/api/tamper", async (c) => {
    parseEmptyBody(await body(c));
    return reply(c, await be().tamper());
  });
  app.post("/api/restore", async (c) => {
    parseEmptyBody(await body(c));
    return reply(c, await be().restore());
  });
  app.post("/api/reset", async (c) => {
    parseEmptyBody(await body(c));
    await be().reset();
    c.header(EVENT_SEQ_HEADER, String(hub.seq));
    return c.body(null, 204);
  });

  app.all("/api/*", (c) => fail(c, 404, "NOT_FOUND", "no such API route"));
}

/** Turns any thrown value into the JSON error shape; unexpected errors are logged here and answered without detail. */
export function errorResponse(err: unknown, c: Context, logger: Logger): Response {
  if (err instanceof BoothError) return fail(c, err.status, err.code, err.message);
  logger.error(`api ${c.req.method} ${c.req.path} failed: ${err instanceof Error ? `${err.name}: ${err.message}` : "unknown error"}`);
  return fail(c, 500, "INTERNAL", "the server could not complete the request (fail closed: no card is minted on an error)");
}
