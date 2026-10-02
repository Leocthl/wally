import { describe, expect, it } from "vitest";
import type { JudgeInput, JudgePort, JudgeRecord } from "@laisee/core/ports";
import { CLEAN_ANSWERS } from "@laisee/core/testing";
import { withDeadline } from "../src/judge/deadline";
import { generateScenarios } from "../src/scenario/generate";
import { judgeInputOf } from "../src/systems/b2";
import { STEP_MS } from "./support/timeouts";

const input: JudgeInput = judgeInputOf(generateScenarios({ seed: 7, n: 1 })[0]!);
const ok = (latency: number): JudgeRecord => ({ provider: "laya", model: "typed-decisions", version: "test", status: "OK", latency_ms: latency, shadow: false, answers: CLEAN_ANSWERS });
const after = (ms: number, record: JudgeRecord): JudgePort => ({ provider: "laya", assess: () => new Promise((resolve) => setTimeout(() => resolve(record), ms)) });

describe("the deadline layer in front of the recorder", () => {
  it("passes an answer that arrives in time through unchanged", async () => {
    const record = await withDeadline(after(5, ok(5))).assess(input, { timeoutMs: 200 });
    expect(record.status).toBe("OK");
    expect(record.latency_ms).toBe(5);
  }, STEP_MS);

  it("answers TIMEOUT itself when the adapter is late, and the late answer is dropped", async () => {
    const record = await withDeadline(after(120, ok(120))).assess(input, { timeoutMs: 40 });
    expect(record).toMatchObject({ status: "TIMEOUT", latency_ms: 40, provider: "laya" });
    expect(record.answers).toBeUndefined();
  }, STEP_MS);

  it("fires before the caller's own deadline, so its record is the one the caller sees", async () => {
    // The orchestrator races the judge against its own timer for the same time; the layer's answer must win that race.
    const caller = new Promise<"caller">((resolve) => setTimeout(() => resolve("caller"), 60));
    const winner = await Promise.race([withDeadline(after(500, ok(500))).assess(input, { timeoutMs: 60 }).then(() => "layer" as const), caller]);
    expect(winner).toBe("layer");
  }, STEP_MS);

  it("leaves no timer behind when the adapter answers first", async () => {
    const before = process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;
    await withDeadline(after(1, ok(1))).assess(input, { timeoutMs: 10_000 });
    expect(process.getActiveResourcesInfo().filter((r) => r === "Timeout").length).toBeLessThanOrEqual(before);
  }, STEP_MS);

  it("keeps the provider, so the record names the judge that was too slow", () => {
    expect(withDeadline(after(1, ok(1))).provider).toBe("laya");
  });
});
