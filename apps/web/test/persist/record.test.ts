// The stored record `wally:session:v1`: one versioned JSON text with the demo keys, the log as JSONL, the head
// checkpoint and the save time. The codec is strict both ways: a record that does not read back exactly as written is
// refused with a reason, never half-read (fail closed), and one that is too big is neither written nor read.
import { describe, expect, it } from "vitest";
import { newKeyMaterial } from "../../src/api/local/persist/keys";
import { decodeRecord, encodeRecord, MAX_RECORD_CHARS, SESSION_KEY, SESSION_VERSION, type SessionRecord } from "../../src/api/local/persist/record";

const HASH = "a".repeat(64);
const HEAD = { log_id: "log_AbCdEfGhIjKlMnOp", seq: 2, entry_hash: HASH };
const SAVED = new Date("2026-10-03T02:05:06.789Z");

function parts(over: Partial<{ log: string }> = {}) {
  return { savedAt: SAVED, keys: newKeyMaterial().files, log: '{"seq":0}\n{"seq":1}\n{"seq":2}\n', head: HEAD, ...over };
}

function encoded(over: Partial<{ log: string }> = {}): string {
  const result = encodeRecord(parts(over));
  if (!result.ok) throw new Error(`encode failed: ${result.problem}`);
  return result.text;
}

/** The record as an object, changed by `edit`, as text again. */
function edited(edit: (record: Record<string, unknown>) => void): string {
  const record = JSON.parse(encoded()) as Record<string, unknown>;
  edit(record);
  return JSON.stringify(record);
}

describe("the key and the version", () => {
  it("the key carries the version, so a later shape can sit beside this one", () => {
    expect(SESSION_KEY).toBe("wally:session:v1");
    expect(SESSION_VERSION).toBe(1);
  });
});

describe("encode and decode", () => {
  it("reads back exactly what was written", () => {
    const input = parts();
    const result = encodeRecord(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const decoded = decodeRecord(result.text);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const record: SessionRecord = decoded.record;
    expect(record.v).toBe(1);
    expect(record.savedAt).toBe("2026-10-03T02:05:06.789Z");
    expect(record.log).toBe(input.log);
    expect(record.head).toEqual(HEAD);
    expect(record.keys).toEqual(input.keys);
  });

  it("is plain JSON text of the five known fields and nothing else", () => {
    expect(Object.keys(JSON.parse(encoded()) as object).sort()).toEqual(["head", "keys", "log", "savedAt", "v"]);
  });

  it("writes the same text for the same input (no hidden clock or randomness)", () => {
    const input = parts();
    expect(encodeRecord(input)).toEqual(encodeRecord(input));
  });
});

describe("a record it refuses", () => {
  it("is not JSON", () => {
    expect(decodeRecord("{not json")).toEqual({ ok: false, problem: "NOT_JSON" });
    expect(decodeRecord("")).toEqual({ ok: false, problem: "NOT_JSON" });
  });

  it.each([["null", "null"], ["a list", "[]"], ["a number", "7"], ["a string", '"x"']])("is %s, not an object", (_name, text) => {
    expect(decodeRecord(text)).toEqual({ ok: false, problem: "SHAPE" });
  });

  it("names another version: a bumped v is refused, not read as this one", () => {
    expect(decodeRecord(edited((r) => (r["v"] = 2)))).toEqual({ ok: false, problem: "VERSION" });
    expect(decodeRecord(edited((r) => (r["v"] = 0)))).toEqual({ ok: false, problem: "VERSION" });
    expect(decodeRecord(edited((r) => (r["v"] = "1")))).toEqual({ ok: false, problem: "SHAPE" });
  });

  it.each(["v", "savedAt", "keys", "log", "head"])("is missing %s", (field) => {
    expect(decodeRecord(edited((r) => delete r[field]))).toMatchObject({ ok: false });
  });

  it("carries a field it does not know", () => {
    expect(decodeRecord(edited((r) => (r["extra"] = 1)))).toEqual({ ok: false, problem: "SHAPE" });
  });

  it("has fields of the wrong kind", () => {
    for (const edit of [
      (r: Record<string, unknown>) => (r["log"] = 5),
      (r: Record<string, unknown>) => (r["log"] = ""),
      (r: Record<string, unknown>) => (r["log"] = "no trailing newline"),
      (r: Record<string, unknown>) => (r["savedAt"] = "yesterday"),
      (r: Record<string, unknown>) => (r["savedAt"] = 1),
      (r: Record<string, unknown>) => (r["keys"] = "secret"),
      (r: Record<string, unknown>) => (r["keys"] = { engine: {} }),
      (r: Record<string, unknown>) => (r["head"] = { log_id: "x", seq: -1, entry_hash: "y" }),
      (r: Record<string, unknown>) => (r["head"] = null),
    ]) {
      expect(decodeRecord(edited(edit)), String(edit)).toEqual({ ok: false, problem: "SHAPE" });
    }
  });

  it("holds a key file whose fields are not text", () => {
    const text = edited((r) => {
      const keys = r["keys"] as { engine: Record<string, unknown> };
      keys.engine["secret_key"] = 12;
    });
    expect(decodeRecord(text)).toEqual({ ok: false, problem: "SHAPE" });
  });
});

describe("size", () => {
  it("is not written when it is over the cap", () => {
    expect(encodeRecord(parts({ log: `${"x".repeat(MAX_RECORD_CHARS)}\n` }))).toEqual({ ok: false, problem: "TOO_LARGE" });
  });

  it("is not read when it is over the cap (the text is not even parsed)", () => {
    expect(decodeRecord(" ".repeat(MAX_RECORD_CHARS + 1))).toEqual({ ok: false, problem: "TOO_LARGE" });
  });

  it("a record just under the cap round-trips", () => {
    const room = MAX_RECORD_CHARS - encoded({ log: "\n" }).length - 1000;
    const result = encodeRecord(parts({ log: `${"x".repeat(room)}\n` }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(decodeRecord(result.text).ok).toBe(true);
  });
});
