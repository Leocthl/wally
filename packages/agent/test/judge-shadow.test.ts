import { describe, expect, it } from "vitest";
import { FakeJudge } from "@laisee/core/testing";
import { validateJudgeRecord } from "@laisee/core/schema";
import type { JudgeInput, JudgePort } from "@laisee/core/ports";
import { ShadowJudge } from "../src/judge/shadow-judge";
import { demoInput } from "./support/inputs";

const input = demoInput("injected-tee");

describe("ShadowJudge", () => {
  it("runs the real judge and marks the record shadow, leaving everything else as it was", async () => {
    const inner = new FakeJudge({ answers: { injection_risk: { clean: 0.1, suspicious: 0.1, injection: 0.8 } } });
    const plain = await new FakeJudge({ answers: { injection_risk: { clean: 0.1, suspicious: 0.1, injection: 0.8 } } }).assess(input, { timeoutMs: 1000 });
    const shadowed = await new ShadowJudge(inner).assess(input, { timeoutMs: 1000 });
    expect(plain.shadow).toBe(false);
    expect(shadowed.shadow).toBe(true);
    expect({ ...shadowed, shadow: false }).toEqual(plain);
    expect(inner.calls).toHaveLength(1);
  });

  it("keeps the provider of the judge it wraps", () => {
    expect(new ShadowJudge(new FakeJudge({ provider: "jev" })).provider).toBe("jev");
    expect(new ShadowJudge(new FakeJudge()).provider).toBe("laya");
  });

  it("passes failures through unchanged apart from the flag", async () => {
    const failing = new FakeJudge({ status: "ERROR" });
    const record = await new ShadowJudge(failing).assess(input, { timeoutMs: 1000 });
    expect(record.status).toBe("ERROR");
    expect(record.shadow).toBe(true);
    expect(record.answers).toBeUndefined();
    const truncated = await new ShadowJudge(new FakeJudge({ inputTruncated: true })).assess(input, { timeoutMs: 1000 });
    expect(truncated.input_truncated).toBe(true);
  });

  it("turns a throwing inner judge into an ERROR record instead of throwing", async () => {
    const broken: JudgePort = {
      provider: "laya",
      assess: (_input: JudgeInput) => {
        throw new Error("contract violation");
      },
    };
    const record = await new ShadowJudge(broken).assess(input, { timeoutMs: 1000 });
    expect(record.status).toBe("ERROR");
    expect(record.shadow).toBe(true);
    expect(validateJudgeRecord(record).ok).toBe(true);
    const rejecting: JudgePort = { provider: "jev", assess: () => Promise.reject(new Error("nope")) };
    expect((await new ShadowJudge(rejecting).assess(input, { timeoutMs: 1000 })).status).toBe("ERROR");
  });

  it("does not modify the record the inner judge returned", async () => {
    const frozen = Object.freeze({
      provider: "laya" as const,
      model: "m",
      version: "v",
      status: "ERROR" as const,
      latency_ms: 1,
      shadow: false,
    });
    const inner: JudgePort = { provider: "laya", assess: async () => frozen };
    const record = await new ShadowJudge(inner).assess(input, { timeoutMs: 1000 });
    expect(frozen.shadow).toBe(false);
    expect(record.shadow).toBe(true);
  });
});
