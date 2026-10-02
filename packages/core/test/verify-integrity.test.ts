// assertLogIntegrity (verify-on-open, audit LOW): the orchestrator's guard before folding a stored log.
import { describe, expect, it } from "vitest";
import { LogError } from "../src/log";
import { assertLogIntegrity, LogIntegrityError } from "../src/verify";
import { asJson, buildDemoLog } from "./log-helpers";

const demo = await buildDemoLog();

describe("assertLogIntegrity", () => {
  it("returns the verified head, with or without the last published checkpoint", () => {
    expect(assertLogIntegrity(demo.entries, demo.keys.publicKeys)).toEqual(demo.checkpoint);
    expect(assertLogIntegrity(demo.entries, demo.keys.publicKeys, demo.checkpoint)).toEqual(demo.checkpoint);
  });

  it("throws a LogError (INTEGRITY) that carries the first failing seq and reason", () => {
    const edited = asJson(demo.entries).map((e, i) => (i === 4 ? { ...e, payload: { ...(e["payload"] as object), amount_minor: 1 } } : e));
    let thrown: unknown;
    try {
      assertLogIntegrity(edited, demo.keys.publicKeys);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(LogIntegrityError);
    expect(thrown).toBeInstanceOf(LogError);
    expect(thrown).toMatchObject({ code: "INTEGRITY", report: { failedSeq: 4, reason: "PAYLOAD_HASH" } });
  });

  it("refuses a truncated log against the checkpoint and keys without a pinned delegator", () => {
    expect(() => assertLogIntegrity(demo.entries.slice(0, 5), demo.keys.publicKeys, demo.checkpoint)).toThrow(/TRUNCATED/);
    const unpinned = { engine: demo.keys.publicKeys.engine } as unknown as typeof demo.keys.publicKeys;
    expect(() => assertLogIntegrity(demo.entries, unpinned)).toThrow(/KEYS/);
  });
});
