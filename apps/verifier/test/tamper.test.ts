// Tamper flips ONE byte of a copy, in a meaningful field, deterministically; the verifier must then fail there.
import { describe, expect, it } from "vitest";
import { isPass, runVerification } from "../src/run";
import { tamperLog } from "../src/tamper";
import { CHECKPOINT, joinLines, KEYS, LINES, LOG } from "./helpers";

const encoder = new TextEncoder();

function differingBytes(a: string, b: string): number {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  if (x.length !== y.length) return Number.POSITIVE_INFINITY;
  return x.reduce((n, byte, i) => n + (byte === y[i] ? 0 : 1), 0);
}

describe("tamperLog on the SIMULATED golden log", () => {
  const result = tamperLog(LOG);

  it("changes the approved limit of the first DECISION by one byte", () => {
    if (!result.ok) throw new Error(result.message);
    expect(result.change).toMatchObject({ seq: 1, kind: "DECISION", field: "payload.approved_limit_minor", before: "25900", after: "35900", line: 2 });
    expect(differingBytes(LOG, result.text)).toBe(1);
    expect(result.text[result.change.offset]).toBe(result.change.toChar);
    expect(LOG[result.change.offset]).toBe(result.change.fromChar);
    expect(LINES[1]?.[result.change.column - 1]).toBe(result.change.fromChar);
  });

  it("is deterministic and leaves the original text untouched", () => {
    expect(tamperLog(LOG)).toEqual(result);
    expect(LOG).toBe(joinLines(LINES));
  });

  it("makes the verifier fail PAYLOAD_HASH at that seq, with and without the checkpoint", () => {
    if (!result.ok) throw new Error(result.message);
    for (const checkpoint of [CHECKPOINT, ""]) {
      const run = runVerification({ log: result.text, keys: KEYS, checkpoint });
      expect(run.kind === "checked" && run.report).toMatchObject({ ok: false, failedSeq: 1, reason: "PAYLOAD_HASH" });
    }
  });
});

describe("tamperLog on other logs", () => {
  it("makes every valid prefix of the golden log fail (always a meaningful field or the time)", () => {
    for (let n = 1; n <= LINES.length; n += 1) {
      const log = joinLines(LINES.slice(0, n));
      expect(isPass(runVerification({ log, keys: KEYS, checkpoint: "" })), `prefix ${n} passes before`).toBe(true);
      const tampered = tamperLog(log);
      if (!tampered.ok) throw new Error(`prefix ${n}: ${tampered.message}`);
      expect(differingBytes(log, tampered.text)).toBe(1);
      expect(isPass(runVerification({ log: tampered.text, keys: KEYS, checkpoint: "" })), `prefix ${n} passes after`).toBe(false);
    }
  });

  it("falls back to the seq 0 time when no amount field exists", () => {
    const result = tamperLog(joinLines(LINES.slice(0, 1)));
    expect(result.ok && result.change).toMatchObject({ seq: 0, kind: "MANDATE_SEALED", field: "ts" });
  });

  it("never makes a leading zero (a 1 at the front flips the next digit)", () => {
    const log = LOG.replace('"approved_limit_minor":25900', '"approved_limit_minor":15900');
    const result = tamperLog(log);
    expect(result.ok && result.change).toMatchObject({ before: "15900", after: "14900" });
  });

  it.each(["", "garbage\n", "{}\n", '{"payload":{"amount_minor":"5"}}\n'])("refuses %j with a message", (text) => {
    const result = tamperLog(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/Nothing to tamper/);
  });
});
