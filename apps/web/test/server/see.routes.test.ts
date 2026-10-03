// @vitest-environment node
// POST /api/see on the routes alone (Hono app.request, no sockets): the same guards as every other POST (loopback Host and
// Origin, JSON content type), its own larger body cap for the picture while every other route keeps its small one, strict
// bodies, the picture's type and size from its bytes, and the JSON error shape. The backend is a recording stub here.
import { MAX_IMAGE_BYTES } from "@wally/agent/vision";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHttpApp, MAX_BODY_BYTES, NOT_COMPOSED_BACKEND } from "../../server/app";
import type { BoothBackend } from "../../server/backend";
import { BoothError } from "../../server/http/errors";
import { SseHub } from "../../server/http/sse";
import type { SeeResult } from "../../src/api/types";
import type { SeeInput } from "../../src/booth/backend/validate";
import { jpegBytes, toBase64 } from "../helpers/pictures";

const BASE = "http://127.0.0.1:8787";
const RESULT: SeeResult = { source: "chips", attributes: { kind: "hoodie", colors: ["navy"], pattern: null, fit: null, style: [] }, palette: [], matches: [] };

let hub: SseHub;
let seen: SeeInput[];

function app(over: Partial<BoothBackend> = {}) {
  const backend: BoothBackend = { ...NOT_COMPOSED_BACKEND, see: async (input) => (seen.push(input), RESULT), ...over };
  return createHttpApp({ backend: () => backend, hub });
}

const post = (body: unknown, headers: Record<string, string> = {}, over: Partial<BoothBackend> = {}) =>
  app(over).request(`${BASE}/api/see`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

async function errorOf(res: Response): Promise<{ code: string; message: string }> {
  expect(res.headers.get("content-type")).toContain("application/json");
  return ((await res.json()) as { error: { code: string; message: string } }).error;
}

/** A picture of `bytes` bytes: a real JPEG header, then zeros (the photo code reads headers only). */
function picture(bytes: number): { image: { mime: string; data: string } } {
  const body = new Uint8Array(bytes);
  body.set(jpegBytes());
  return { image: { mime: "image/jpeg", data: toBase64(body) } };
}

beforeEach(() => {
  hub = new SseHub({ keepAliveMs: 60_000, maxQueuedChunks: 64 });
  seen = [];
});
afterEach(() => hub.close());

describe("POST /api/see", () => {
  it("answers the SeeResult as JSON, not cached, with no event sequence (it is not a run)", async () => {
    const res = await post({ attributes: { kind: "hoodie", colors: ["navy"] } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(RESULT);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-event-seq")).toBeNull();
    expect(seen[0]?.attributes).toMatchObject({ kind: "hoodie", colors: ["navy"] });
  });

  it("hands the backend the decoded picture", async () => {
    const res = await post(picture(2_000));
    expect(res.status).toBe(200);
    expect(seen[0]?.image?.bytes.length).toBe(2_000);
    expect(seen[0]?.image?.mime).toBe("image/jpeg");
  });

  it("takes a normal page-prepared picture of several hundred kilobytes, far above the small cap of the other routes", async () => {
    const res = await post(picture(MAX_BODY_BYTES * 3));
    expect(res.status).toBe(200);
  });

  it("takes a picture right up to 6 MB, and refuses more with 413 and the JSON error shape", async () => {
    expect((await post(picture(MAX_IMAGE_BYTES))).status).toBe(200);
    const res = await post(picture(MAX_IMAGE_BYTES + 1));
    expect(res.status).toBe(413);
    expect((await errorOf(res)).code).toBe("PAYLOAD_TOO_LARGE");
    expect(seen).toHaveLength(1);
  });

  it("refuses a body far above the picture cap by its declared length, before reading it", async () => {
    const big = JSON.stringify({ image: { mime: "image/jpeg", data: "A".repeat(12 * 1024 * 1024) } });
    const res = await post(big, { "content-length": String(big.length) });
    expect(res.status).toBe(413);
  });

  it("keeps the small cap on every other route", async () => {
    const res = await app().request(`${BASE}/api/ask`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestText: "x".repeat(MAX_BODY_BYTES + 1) }) });
    expect(res.status).toBe(413);
  });

  it.each([
    ["an empty body", "{}", 400, "INVALID_FIELD"],
    ["a body that is not JSON", "not json", 400, "INVALID_JSON"],
    ["a JSON list", "[]", 400, "INVALID_BODY"],
    ["an unknown key", JSON.stringify({ attributes: { kind: "tee" }, url: "https://example.com" }), 400, "UNKNOWN_FIELD"],
    ["a picture that is not a JPEG, PNG or WebP", JSON.stringify({ image: { mime: "image/jpeg", data: toBase64(Uint8Array.from([71, 73, 70, 56, 57, 97, 1, 0, 1, 0])) } }), 415, "UNSUPPORTED_MEDIA_TYPE"],
    ["a picture and chips together", JSON.stringify({ ...picture(100), attributes: { kind: "tee" } }), 400, "INVALID_FIELD"],
  ])("refuses %s", async (_name, body, status, code) => {
    const res = await post(body);
    expect(res.status).toBe(status);
    expect((await errorOf(res)).code).toBe(code);
    expect(seen).toHaveLength(0);
  });

  it("carries a backend refusal through with its status and code", async () => {
    const res = await post({ attributes: { kind: "tee" } }, {}, { see: async () => Promise.reject(new BoothError(503, "NOT_READY", "later")) });
    expect(res.status).toBe(503);
    expect((await errorOf(res)).code).toBe("NOT_READY");
  });

  it("answers 500 with no detail for an unexpected fault", async () => {
    const res = await post({ attributes: { kind: "tee" } }, {}, { see: async () => Promise.reject(new Error("secret internal detail")) });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
  });
});

describe("the same guards as every other POST", () => {
  it("refuses a foreign Origin and a cross-site fetch", async () => {
    expect((await post({ attributes: { kind: "tee" } }, { origin: "https://evil.example" })).status).toBe(403);
    expect((await post({ attributes: { kind: "tee" } }, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await post({ attributes: { kind: "tee" } }, { origin: "http://127.0.0.1:8787" })).status).toBe(200);
  });

  it("refuses a content type that is not JSON", async () => {
    expect((await post({ attributes: { kind: "tee" } }, { "content-type": "text/plain" })).status).toBe(415);
  });

  it("refuses a Host that is not loopback", async () => {
    const res = await app().request("http://evil.example/api/see", { method: "POST", headers: { "content-type": "application/json", host: "evil.example" }, body: "{}" });
    expect(res.status).toBe(403);
  });

  it("is POST only", async () => {
    const res = await app().request(`${BASE}/api/see`, { method: "GET" });
    expect(res.status).toBe(404);
  });
});
