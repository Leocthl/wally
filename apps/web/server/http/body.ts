// Reads a JSON request body with a hard byte cap, counting bytes as they arrive (a missing or false
// Content-Length cannot get around it). Empty body = {}. Only a plain JSON object is accepted.
import type { JsonObject } from "../../src/booth/backend/validate";
import { BoothError, badRequest } from "./errors";

export type { JsonObject } from "../../src/booth/backend/validate";

function tooLarge(maxBytes: number): BoothError {
  return new BoothError(413, "PAYLOAD_TOO_LARGE", `request body is larger than ${maxBytes} bytes`);
}

async function readCapped(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Uint8Array> {
  if (body === null) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge(maxBytes);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  chunks.reduce((offset, chunk) => {
    out.set(chunk, offset);
    return offset + chunk.byteLength;
  }, 0);
  return out;
}

function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw badRequest("INVALID_ENCODING", "request body is not valid UTF-8");
  }
}

export async function readJsonObject(request: Request, maxBytes: number): Promise<JsonObject> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge(maxBytes);
  const text = decode(await readCapped(request.body, maxBytes)).trim();
  if (text === "") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw badRequest("INVALID_JSON", "request body is not valid JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw badRequest("INVALID_BODY", "request body must be a JSON object");
  return parsed as JsonObject;
}
