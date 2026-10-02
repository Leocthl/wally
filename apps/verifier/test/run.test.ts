// T-V1 at page level, on the page's own entry point (runVerification over the three pasted texts).
import { describe, expect, it } from "vitest";
import { LIMITS } from "../src/limits";
import { isPass, runVerification, type RunResult } from "../src/run";
import { CHECKPOINT, flipField, joinLines, keysJson, KEYS, LINES, LOG } from "./helpers";

const run = (log: string, keys = KEYS, checkpoint = CHECKPOINT): RunResult => runVerification({ log, keys, checkpoint });

function expectFail(result: RunResult, failedSeq: number, reason: string): void {
  expect(isPass(result)).toBe(false);
  expect(result.kind).toBe("checked");
  if (result.kind === "checked") expect(result.report).toMatchObject({ ok: false, failedSeq, reason });
}

function expectInputError(result: RunResult, field: string): void {
  expect(isPass(result)).toBe(false);
  expect(result.kind).toBe("input-error");
  if (result.kind === "input-error") expect(result.errors.map((e) => e.field)).toContain(field);
}

describe("the untouched SIMULATED golden log", () => {
  it("passes with its keys and checkpoint, and reports the head", () => {
    const result = run(LOG);
    expect(isPass(result)).toBe(true);
    if (result.kind !== "checked" || !result.report.ok) throw new Error("expected PASS");
    expect(result.entryCount).toBe(10);
    expect(result.report.head).toEqual(JSON.parse(CHECKPOINT));
    expect(result.checkpoint).toEqual(JSON.parse(CHECKPOINT));
  });

  it("passes without the optional checkpoint (no truncation check)", () => {
    const result = run(LOG, KEYS, "  \n");
    expect(isPass(result)).toBe(true);
    if (result.kind === "checked") expect(result.checkpoint).toBeUndefined();
  });
});

describe("one changed byte fails at its seq with the right reason", () => {
  it.each([
    ["v", 2, 0, "SCHEMA"],
    ["seq", 2, 0, "SEQ"],
    ["kind", 3, 1, "SCHEMA"],
    ["log_id", 3, 10, "ENTRY_HASH"],
    ["ts", 4, 23, "ENTRY_HASH"],
    ["prev_hash", 4, 1, "PREV_HASH"],
    ["payload_hash", 5, 1, "PAYLOAD_HASH"],
    ["entry_hash", 6, 1, "ENTRY_HASH"],
    ["signature", 7, 1, "SIGNATURE"],
    ["approved_limit_minor", 1, 1, "PAYLOAD_HASH"],
    ["amount_minor", 4, 1, "PAYLOAD_HASH"],
  ] as const)("%s at seq %i", (field, seq, skip, reason) => {
    expectFail(run(flipField(LOG, seq, field, skip)), seq, reason);
  });

  it("the credential proof in seq 0 fails PAYLOAD_HASH (a base58 letter changed) or SCHEMA (not base58)", () => {
    const proof = /"proofValue":"(z[^"]+)"/.exec(LINES[0] ?? "")?.[1] ?? "";
    const letter = proof.search(/[A-HJ-NP-Z]/);
    expectFail(run(flipField(LOG, 0, "proofValue", 1 + letter)), 0, "PAYLOAD_HASH");
    const digit = proof.search(/[2-9]/);
    expectFail(run(flipField(LOG, 0, "proofValue", 1 + digit)), 0, "SCHEMA");
  });

  it("a changed signer (header field) fails at its seq", () => {
    const result = run(flipField(LOG, 1, "signer", 20));
    expect(isPass(result)).toBe(false);
    if (result.kind === "checked" && !result.report.ok) expect(result.report.failedSeq).toBe(1);
  });

  it("a changed outcome fails at its seq", () => {
    const result = run(flipField(LOG, 5, "outcome", 1));
    expect(isPass(result)).toBe(false);
    if (result.kind === "checked" && !result.report.ok) expect(result.report.failedSeq).toBe(5);
  });
});

describe("order, duplicates, dropped entries and truncation", () => {
  const [l0, l1, l2, l3, l4, l5, ...rest] = LINES as [string, string, string, string, string, string, ...string[]];

  it("reorder fails SEQ at the first moved line", () => {
    expectFail(run(joinLines([l0, l1, l2, l4, l3, l5, ...rest])), 3, "SEQ");
  });

  it("a duplicated entry fails SEQ", () => {
    expectFail(run(joinLines([l0, l1, l2, l2, l3, l4, l5, ...rest])), 3, "SEQ");
  });

  it("a dropped middle entry fails SEQ", () => {
    expectFail(run(joinLines([l0, l1, l2, l3, l4, ...rest])), 5, "SEQ");
  });

  it("truncation fails TRUNCATED with the checkpoint and passes without it (stated limit)", () => {
    const cut = joinLines([l0, l1, l2, l3, l4, l5]);
    expectFail(run(cut), 6, "TRUNCATED");
    expect(isPass(run(cut, KEYS, ""))).toBe(true);
  });

  it("a checkpoint for another log fails TRUNCATED", () => {
    const other = JSON.stringify({ ...JSON.parse(CHECKPOINT), log_id: "log_otherLog1" });
    expectFail(run(LOG, KEYS, other), 0, "TRUNCATED");
  });
});

describe("keys", () => {
  it("a wrong delegator key fails PAYLOAD_SIGNATURE at seq 0", () => {
    const k = keysJson();
    expectFail(run(LOG, JSON.stringify({ ...k, delegator: k.agent })), 0, "PAYLOAD_SIGNATURE");
  });

  it("a wrong engine key fails SIGNATURE at seq 0", () => {
    const k = keysJson();
    expectFail(run(LOG, JSON.stringify({ ...k, engine: [k.agent] })), 0, "SIGNATURE");
  });
});

describe("bad input never passes and never throws", () => {
  it("garbage log text fails SCHEMA at seq 0 with a readable detail", () => {
    const result = run("hello\nworld\n");
    expectFail(result, 0, "SCHEMA");
    if (result.kind === "checked" && !result.report.ok) expect(result.report.detail).toMatch(/not JSON/);
  });

  it.each(["", "   \n\t\n"])("an empty log (%j) is an input error", (log) => {
    expectInputError(run(log), "log");
  });

  it("a log over the size cap is refused with the limit in the message", () => {
    const result = run("x".repeat(LIMITS.logChars + 1));
    expectInputError(result, "log");
    if (result.kind === "input-error") expect(result.errors[0]?.message).toContain(LIMITS.logChars.toLocaleString("en"));
  });

  it.each(["", "not json", "[]", '"did:key:z6Mk"', "null", "{}", '{"engine":"x","delegator":"y"}', `{"engine":[],"delegator":"x"}`])(
    "public keys %j are an input error",
    (keys) => expectInputError(run(LOG, keys), "keys"),
  );

  it.each(["not json", "[]", "7", '{"log_id":"log_demoM0"}', '{"log_id":"log_demoM0","seq":-1,"entry_hash":"00"}'])(
    "checkpoint %j is an input error",
    (checkpoint) => expectInputError(run(LOG, KEYS, checkpoint), "checkpoint"),
  );

  it("oversized keys or checkpoint are refused", () => {
    expectInputError(run(LOG, " ".repeat(LIMITS.smallChars + 1)), "keys");
    expectInputError(run(LOG, KEYS, " ".repeat(LIMITS.smallChars + 1)), "checkpoint");
  });

  it("reports every bad field at once", () => {
    const result = run("", "nope", "nope");
    expect(result.kind === "input-error" && result.errors.map((e) => e.field)).toEqual(["log", "keys", "checkpoint"]);
  });

  it("__proto__ payloads do not pollute Object.prototype and do not pass", () => {
    const k = keysJson();
    const polluted = '{"__proto__":{"polluted":"yes"}}';
    expectInputError(run(LOG, JSON.stringify({ engine: k.engine, delegator: k.delegator }).replace("{", `{"__proto__":{"polluted":"yes"},`)), "keys");
    expectInputError(run(LOG, KEYS, polluted), "checkpoint");
    expectFail(run(`${polluted}\n`), 0, "SCHEMA");
    expectFail(run(joinLines([...LINES.slice(0, 2), '{"constructor":{"prototype":{"polluted":"yes"}}}'])), 2, "SCHEMA");
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty("polluted");
  });

  it("deeply nested JSON lines fail closed", () => {
    const deep = `${"[".repeat(100_000)}${"]".repeat(100_000)}`;
    expect(isPass(run(`${deep}\n`))).toBe(false);
  });
});
