// Size limits (audit LOWs): oversized rule inputs and over-long lines are refused on write, and the verifier
// refuses an over-long line before parsing it and keeps every failure detail small and fast to produce.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { jcs } from "../src/crypto";
import type { Decision } from "../src/generated";
import { appendEntry, LOG_LIMITS, toJsonl } from "../src/log";
import { FileLogStore } from "../src/log/file";
import { MemoryLogStore } from "../src/testing";
import { parseLogText, verifyLogText } from "../src/verify";
import { buildDemoLog, decisionExample, demoKeys, demoSteps, LOG_ID } from "./log-helpers";

const NOW = new Date("2026-10-03T02:00:01Z");
/** Generous for a loaded machine: the audit measured 13.6 s on a 1 MB line before the fix. */
const FAST_MS = 3_000;

function nested(depth: number): unknown {
  return depth === 0 ? "leaf" : { next: nested(depth - 1) };
}

function withInputs(inputs: Record<string, unknown>, at: "rule" | "explanation"): Decision {
  const d = decisionExample();
  if (at === "explanation") return { ...d, explanation: { ...d.explanation!, inputs } };
  return { ...d, rules: d.rules.map((r, i) => (i === 0 ? { ...r, inputs } : r)) as Decision["rules"] };
}

async function sealedStore() {
  const keys = demoKeys();
  const store = new MemoryLogStore();
  await appendEntry(store, keys.engine, LOG_ID, "MANDATE_SEALED", demoSteps(keys)[0]!.payload as never, NOW);
  return { keys, store };
}

describe("the writer refuses oversized decisions (LIMIT)", () => {
  it("rule or explanation inputs nested too deep or too large", async () => {
    const { keys, store } = await sealedStore();
    const deep = { chain: nested(LOG_LIMITS.inputsDepth) };
    const big = { blob: "x".repeat(LOG_LIMITS.inputsChars) };
    for (const d of [withInputs(deep, "rule"), withInputs(big, "rule"), withInputs(deep, "explanation"), withInputs(big, "explanation")]) {
      await expect(appendEntry(store, keys.engine, LOG_ID, "DECISION", d, NOW)).rejects.toMatchObject({ code: "LIMIT" });
    }
    const atLimit = { chain: nested(LOG_LIMITS.inputsDepth - 2) };
    await appendEntry(store, keys.engine, LOG_ID, "DECISION", withInputs(atLimit, "rule"), NOW);
    expect(await store.read(LOG_ID)).toHaveLength(2);
  });

  it("a line over the shared line limit even when every inputs object is within its own limit", async () => {
    const { keys, store } = await sealedStore();
    const d = decisionExample();
    const each = { blob: "y".repeat(LOG_LIMITS.inputsChars - 64) };
    const long = { ...d, rules: d.rules.map((r) => ({ ...r, inputs: each })) as unknown as Decision["rules"] };
    expect(jcs(long).length).toBeGreaterThan(LOG_LIMITS.lineChars);
    await expect(appendEntry(store, keys.engine, LOG_ID, "DECISION", long, NOW)).rejects.toMatchObject({ code: "LIMIT" });
  });
});

describe("the verifier refuses an over-long line before parsing it", () => {
  it("a 1 MB line fails SCHEMA fast, with a short detail", async () => {
    const demo = await buildDemoLog();
    const lines = toJsonl(demo.entries).split("\n");
    const huge = `{"a":[${"1,".repeat(512 * 1024)}1]}`;
    const text = [lines[0], huge, ...lines.slice(2)].join("\n");
    const started = performance.now();
    const result = verifyLogText(text, demo.keys.publicKeys);
    expect(performance.now() - started).toBeLessThan(FAST_MS);
    expect(result).toMatchObject({ ok: false, failedSeq: 1, reason: "SCHEMA" });
    expect(!result.ok && result.detail).toContain(`over ${LOG_LIMITS.lineChars}`);
    expect(parseLogText(text).entries[1]).toBe("");
  });

  it("a canonical line just under the limit with thousands of errors fails fast with a bounded detail", async () => {
    const demo = await buildDemoLog();
    const lines = toJsonl(demo.entries).split("\n");
    const second = JSON.parse(lines[1]!) as Record<string, unknown>;
    const junk = Array.from({ length: 4000 }, (_, i) => ({ i }));
    const hostile = jcs({ ...second, payload: { ...(second["payload"] as object), rules: junk } });
    expect(hostile.length).toBeLessThan(LOG_LIMITS.lineChars);
    const started = performance.now();
    const result = verifyLogText([lines[0], hostile, ""].join("\n"), demo.keys.publicKeys);
    expect(performance.now() - started).toBeLessThan(FAST_MS);
    expect(result).toMatchObject({ ok: false, failedSeq: 1, reason: "SCHEMA" });
    expect(!result.ok && result.detail.length).toBeLessThanOrEqual(400);
  });
});

describe("FileLogStore and the line limit", () => {
  let dir = "";
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "laisee-limits-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads an over-long stored line as CORRUPT", async () => {
    const { entries } = await buildDemoLog();
    await writeFile(join(dir, `${LOG_ID}.jsonl`), `${jcs(entries[0])}\n${"z".repeat(LOG_LIMITS.lineChars + 1)}\n`);
    await expect(new FileLogStore(dir).read(LOG_ID)).rejects.toMatchObject({ code: "CORRUPT" });
  });
});
