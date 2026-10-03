// @vitest-environment node
// The line in front of the shared models. Laya answers one decision in about 140 ms, so a dozen phones tapping in the same
// second would queue inside Laya and the last decisions would run past the judge deadline (1.5 s [F34]) and escalate. The
// visitors' wallets take turns instead: at most a few runs at once, the rest wait their turn before any deadline starts.
import { createJudgeFromEnv } from "@wally/agent/judge";
import type { JudgeInput, JudgePort, JudgeRecord } from "@wally/core/ports";
import { afterEach, describe, expect, it } from "vitest";
import type { BoothBackend } from "../../server/backend";
import type { Booth } from "../../server/compose";
import { Gate, gated, MODEL_RUNS_AT_ONCE } from "../../server/gate";
import { orchestratorIsReal } from "./support/realStack";
import { bootLan, macOf, phonesOf } from "./support/phones";

const REAL = await orchestratorIsReal();
const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe("Gate", () => {
  it("lets at most `limit` tasks run at once and starts the others in the order they came", async () => {
    const gate = new Gate(2);
    const started: number[] = [];
    let running = 0;
    let most = 0;
    const releases: (() => void)[] = [];
    const job = (n: number) =>
      gate.run(async () => {
        started.push(n);
        running += 1;
        most = Math.max(most, running);
        await new Promise<void>((resolve) => releases.push(resolve));
        running -= 1;
        return n * 10;
      });
    const all = [1, 2, 3, 4, 5].map(job);
    await tick();
    expect(started).toEqual([1, 2]);
    expect(gate.waiting).toBe(3);
    releases.shift()?.();
    await tick();
    expect(started).toEqual([1, 2, 3]);
    while (releases.length > 0 || started.length < 5) {
      releases.shift()?.();
      await tick();
    }
    expect(await Promise.all(all)).toEqual([10, 20, 30, 40, 50]);
    expect(most).toBe(2);
    expect(gate.waiting).toBe(0);
  });

  it("hands the slot on when a task throws, and the caller still gets the error", async () => {
    const gate = new Gate(1);
    const bad = gate.run(async () => {
      throw new Error("planner down");
    });
    const next = gate.run(async () => "served");
    await expect(bad).rejects.toThrow("planner down");
    expect(await next).toBe("served");
  });

  it("needs a limit of at least one", () => {
    expect(() => new Gate(0)).toThrow(RangeError);
    expect(() => new Gate(1.5)).toThrow(RangeError);
    expect(MODEL_RUNS_AT_ONCE).toBeGreaterThanOrEqual(1);
  });
});

describe("gated", () => {
  const calls: string[] = [];
  const fake = {
    runScenario: async () => (calls.push("run"), "ran"),
    snapshot: async () => (calls.push("snapshot"), "snap"),
    subscribe: () => () => undefined,
  } as unknown as BoothBackend;

  it("makes the runs that reach the models take turns, and lets reads straight through", async () => {
    const gate = new Gate(1);
    const holder = gate.run(() => new Promise<void>(() => undefined)); // the one slot is taken for good
    void holder;
    const wrapped = gated(fake, gate);
    const read = await wrapped.snapshot();
    expect(read).toBe("snap");
    const run = wrapped.runScenario("normal");
    await tick(5);
    expect(calls).toEqual(["snapshot"]); // the run waits for the slot, the read did not
    expect(gate.waiting).toBe(1);
    void run;
  });
});

/** The replay judge, slowed a little, that counts how many assessments overlap. */
function countingJudge(): { readonly judge: JudgePort; readonly most: () => number; readonly total: () => number } {
  const inner = createJudgeFromEnv({ JUDGE_PROVIDER: "replay", JUDGE_MODE: "enforce" });
  let now = 0;
  let most = 0;
  let total = 0;
  const judge: JudgePort = {
    provider: inner.provider,
    async assess(input: JudgeInput, opts): Promise<JudgeRecord> {
      now += 1;
      total += 1;
      most = Math.max(most, now);
      await tick(25);
      try {
        return await inner.assess(input, opts);
      } finally {
        now -= 1;
      }
    },
  };
  return { judge, most: () => most, total: () => total };
}

const booths: Booth[] = [];
afterEach(async () => {
  for (const b of booths.splice(0)) await b.close();
});

describe.skipIf(!REAL)("in the booth", () => {
  it("twelve phones tapping Buy a cotton tee in the same second reach the judge two at a time, and all are approved", async () => {
    const counting = countingJudge();
    const booth = await bootLan({ judge: counting.judge, sessionLimits: { runsAtOnce: 2 } });
    booths.push(booth);
    const phones = phonesOf(booth, 12);
    for (const p of phones) await p.info();
    const runs = await Promise.all(phones.map((p) => p.run("normal")));
    expect(runs.map((r) => r.outcome)).toEqual(Array(12).fill("APPROVE"));
    expect(counting.total()).toBeGreaterThanOrEqual(12);
    expect(counting.most()).toBeLessThanOrEqual(2);
  });

  it("does not hold the booth Mac in the line: its run starts at once while the visitors wait", async () => {
    const counting = countingJudge();
    const booth = await bootLan({ judge: counting.judge, sessionLimits: { runsAtOnce: 1 } });
    booths.push(booth);
    const phones = phonesOf(booth, 4);
    for (const p of phones) await p.info();
    const mac = macOf(booth);
    const visitors = Promise.all(phones.map((p) => p.run("normal")));
    const own = await mac.run("normal");
    expect(own.outcome).toBe("APPROVE");
    expect((await visitors).map((r) => r.outcome)).toEqual(Array(4).fill("APPROVE"));
    expect(counting.most()).toBeGreaterThanOrEqual(1);
  });
});
