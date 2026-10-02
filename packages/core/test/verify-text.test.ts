// A-19 / T-V1 on the exported JSONL text: one canonical (JCS) line per entry, so any single-byte change
// fails, including whitespace or line-ending changes that would not change the parsed JSON.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { toJsonl } from "../src/log";
import { parseLogText, parsePublicKeys, verifyLogText } from "../src/verify";
import { buildDemoLog, LOG_ID } from "./log-helpers";

const demo = await buildDemoLog();
const KEYS = demo.keys.publicKeys;
const TEXT = toJsonl(demo.entries);
const encoder = new TextEncoder();
const decoder = new TextDecoder(); // lenient: invalid UTF-8 becomes U+FFFD, as when a browser reads a file
/** Each run verifies up to the whole log (about a dozen Ed25519 checks); generous for a loaded machine. */
const SLOW_MS = 60_000;

describe("verifyLogText", () => {
  it("passes the exported log, with or without the final newline", () => {
    expect(verifyLogText(TEXT, KEYS, demo.checkpoint)).toEqual({ ok: true, head: demo.checkpoint });
    expect(verifyLogText(TEXT.slice(0, -1), KEYS).ok).toBe(true);
  });

  it("fails SCHEMA on spellings that parse to the same JSON", () => {
    const lines = TEXT.slice(0, -1).split("\n");
    const variants: [string, number][] = [
      [TEXT.replace("\n", "\r\n"), 0],
      [TEXT.replace('{"entry_hash"', '{ "entry_hash"'), 0],
      [`${TEXT.slice(0, -1)} \n`, lines.length - 1],
      [TEXT.replace(`\n${lines[2]}`, `\n\n${lines[2]}`), 2],
      [TEXT.replace('"v":1', '"v":1.0'), 0],
      [TEXT.replace('"kind":"DECISION"', '"kind":"DECISIO\\u004e"'), 1],
    ];
    for (const [text, seq] of variants) {
      expect(verifyLogText(text, KEYS)).toMatchObject({ ok: false, failedSeq: seq, reason: "SCHEMA" });
    }
  });

  it("explains a bad line", () => {
    const result = verifyLogText(TEXT.replace('{"entry_hash"', '{ "entry_hash"'), KEYS);
    expect(result).toMatchObject({ ok: false, reason: "SCHEMA" });
    expect(!result.ok && result.detail).toContain("canonical");
    expect(parseLogText("{\n").badLines.get(0)).toContain("JSON");
  });

  it("fails on any single-byte change of the exported log (property, T-V1)", () => {
    const bytes = encoder.encode(TEXT);
    fc.assert(
      fc.property(fc.nat({ max: bytes.length - 1 }), fc.integer({ min: 1, max: 255 }), (pos, delta) => {
        const mutated = Uint8Array.from(bytes);
        mutated[pos] = ((bytes[pos] ?? 0) + delta) % 256;
        return verifyLogText(decoder.decode(mutated), KEYS, demo.checkpoint).ok === false;
      }),
      { numRuns: 200 },
    );
  }, SLOW_MS);

  it("fails on every single-byte change inside the seq 0 credential proof and the last line", () => {
    const bytes = encoder.encode(TEXT);
    const proofStart = TEXT.indexOf('"proofValue":"z') + 15;
    const lastStart = TEXT.lastIndexOf("\n", TEXT.length - 2) + 1;
    const positions = [...Array.from({ length: 40 }, (_, i) => proofStart + i), ...Array.from({ length: 60 }, (_, i) => lastStart + i * 3)];
    for (const pos of positions) {
      const mutated = Uint8Array.from(bytes);
      mutated[pos] = (bytes[pos] ?? 0) ^ 0x01;
      expect(verifyLogText(decoder.decode(mutated), KEYS, demo.checkpoint).ok, `byte ${pos}`).toBe(false);
    }
  }, SLOW_MS);
});

describe("parsePublicKeys", () => {
  it("accepts the keys:gen file shape", () => {
    const file = { note: "SIMULATED demo keys", engine: [...KEYS.engine], delegator: KEYS.delegator, agent: demo.keys.agentDid };
    expect(parsePublicKeys(file)).toEqual({ ok: true, value: { engine: KEYS.engine, delegator: KEYS.delegator } });
  });

  it("keeps roles separate: no key may be both delegator and engine", () => {
    const overlapping: unknown[] = [
      { engine: [KEYS.delegator], delegator: KEYS.delegator },
      { engine: [...KEYS.engine, KEYS.delegator], delegator: KEYS.delegator },
    ];
    for (const value of overlapping) {
      const result = parsePublicKeys(value);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]?.message).toContain("separate roles");
    }
  });

  it("rejects missing, malformed or extra fields", () => {
    const good = { engine: [...KEYS.engine], delegator: KEYS.delegator };
    const bad: unknown[] = [
      null,
      { ...good, engine: [] },
      { ...good, engine: KEYS.engine[0] },
      { ...good, engine: ["did:key:z6MkNope"] },
      { ...good, delegator: "did:web:example.com" },
      { ...good, secret_key: "x" },
      { engine: good.engine },
    ];
    for (const value of bad) expect(parsePublicKeys(value).ok).toBe(false);
  });

  it("names the log in the verified head", () => {
    expect(verifyLogText(TEXT, KEYS)).toMatchObject({ ok: true, head: { log_id: LOG_ID } });
  });
});
