// @vitest-environment node
// The line in front of the shared models. Laya answers one decision in about 140 ms, so a dozen phones tapping in the same
// second would queue inside Laya and the last decisions would run past the judge deadline (1.5 s [F34]) and escalate. The
// visitors' wallets take turns instead: at most a few runs at once, the rest wait their turn before any deadline starts.
import { createJudgeFromEnv } from "@wally/agent/judge";
import type { JudgeInput, JudgePort, JudgeRecord } from "@wally/core/ports";
import { afterEach, describe, expect, it } from "vitest";
import type { BoothBackend } from "../../server/backend";
import { BoothError } from "../../server/http/errors";
import type { Booth } from "../../server/compose";
import { Gate, gated, MODEL_OPERATIONS, MODEL_RUNS_AT_ONCE } from "../../server/gate";
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

  it("turns away a task that would make the line longer than it allows, and lets the others finish", async () => {
    const gate = new Gate(1, 2);
    const releases: (() => void)[] = [];
    const job = (n: number) => gate.run(() => new Promise<number>((resolve) => releases.push(() => resolve(n))));
    const [first, second, third, fourth] = [job(1), job(2), job(3), job(4)];
    await expect(fourth).rejects.toMatchObject({ status: 503, code: "BOOTH_BUSY" });
    expect(gate.waiting).toBe(2);
    while (releases.length > 0) {
      releases.shift()?.();
      await tick();
    }
    expect(await Promise.all([first, second, third])).toEqual([1, 2, 3]);
  });

  it("needs a limit of at least one", () => {
    expect(() => new Gate(0)).toThrow(RangeError);
    expect(() => new Gate(1.5)).toThrow(RangeError);
    expect(MODEL_RUNS_AT_ONCE).toBeGreaterThanOrEqual(1);
  });
});

/** Every operation of the backend, so a new one cannot be added without a decision about the line (the compiler checks this list). */
const OPERATIONS = {
  info: true,
  snapshot: true,
  seal: true,
  runScenario: true,
  propose: true,
  revoke: true,
  answerEscalation: true,
  ask: true,
  suggestAlternatives: true,
  compileRules: true,
  see: true,
  getLog: true,
  verify: true,
  tamper: true,
  restore: true,
  reset: true,
  exportLog: true,
  family: true,
  subscribe: true,
} as const satisfies Record<keyof BoothBackend, true>;

/** A backend whose every operation records that it started and waits for the test to let it finish. */
function recording(): { readonly backend: BoothBackend; readonly started: string[]; readonly finish: (name: string) => void } {
  const started: string[] = [];
  const waiting = new Map<string, () => void>();
  const backend = Object.fromEntries(
    (Object.keys(OPERATIONS) as (keyof BoothBackend)[]).map((name) => [
      name,
      (): Promise<string> => {
        started.push(name);
        return new Promise<string>((resolve) => waiting.set(name, () => resolve(name)));
      },
    ]),
  ) as unknown as BoothBackend;
  return { backend, started, finish: (name) => waiting.get(name)?.() };
}

describe("gated", () => {
  const MODEL = [...MODEL_OPERATIONS];
  const LOCAL = (Object.keys(OPERATIONS) as (keyof BoothBackend)[]).filter((name) => !MODEL_OPERATIONS.has(name));

  it("names the operations that reach the planner, the judge and the sentence reader, and no others", () => {
    expect([...MODEL].sort()).toEqual(["answerEscalation", "ask", "compileRules", "propose", "runScenario", "suggestAlternatives"]);
  });

  it.each(MODEL)("makes %s wait for a free place in line", async (name) => {
    const gate = new Gate(1);
    void gate.run(() => new Promise<void>(() => undefined)); // the one place is taken for good
    const { backend, started } = recording();
    const call = (gated(backend, gate) as unknown as Record<string, () => Promise<unknown>>)[name]?.();
    await tick(5);
    expect(started).toEqual([]);
    expect(gate.waiting).toBe(1);
    void call;
  });

  it.each(LOCAL)("lets %s straight through, whatever the line", async (name) => {
    if (name === "subscribe") return; // not a request: returns an unsubscribe
    const gate = new Gate(1);
    void gate.run(() => new Promise<void>(() => undefined));
    const { backend, started } = recording();
    void (gated(backend, gate) as unknown as Record<string, () => Promise<unknown>>)[name]?.();
    await tick(5);
    expect(started).toEqual([name]);
    expect(gate.waiting).toBe(0);
  });

  it("turns a model operation away before it waits when the wallet says so, and still lets the others through", async () => {
    const gate = new Gate(2);
    const { backend, started } = recording();
    const stop = new BoothError(409, "WALLET_FULL", "too long");
    const wallet = gated(backend, gate, () => stop);
    await expect(wallet.runScenario("normal")).rejects.toBe(stop);
    await expect(wallet.ask({ requestText: "a tee" })).rejects.toBe(stop);
    void wallet.snapshot();
    await tick(5);
    expect(started).toEqual(["snapshot"]);
    expect(gate.waiting).toBe(0);
  });

  it("gives a wallet one place in line at a time: a second tap waits behind the first without taking another place", async () => {
    const gate = new Gate(2);
    const phone = recording();
    const other = recording();
    const mine = gated(phone.backend, gate);
    const theirs = gated(other.backend, gate);
    void mine.runScenario("normal"); // takes the first place
    void mine.propose({ listingText: "x" }); // waits behind it in this wallet, not in the line
    void theirs.runScenario("normal"); // another phone gets the second place at once
    await tick(5);
    expect(phone.started).toEqual(["runScenario"]);
    expect(other.started).toEqual(["runScenario"]);
    expect(gate.waiting).toBe(0);
    phone.finish("runScenario");
    await tick(5);
    expect(phone.started).toEqual(["runScenario", "propose"]);
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

  it("turns a run away with a plain 503 when the line is full, and the rest are still approved", async () => {
    const counting = countingJudge();
    const booth = await bootLan({ judge: counting.judge, sessionLimits: { runsAtOnce: 1, lineLength: 2 } });
    booths.push(booth);
    const phones = phonesOf(booth, 6);
    for (const p of phones) await p.info();
    const answers = await Promise.all(phones.map(async (p) => {
      const res = await p.post("/api/scenario/normal");
      return { status: res.status, body: (await res.json()) as { outcome?: string; error?: { code: string } } };
    }));
    const turned = answers.filter((a) => a.status === 503);
    expect(turned.length).toBeGreaterThanOrEqual(1);
    for (const a of turned) expect(a.body.error?.code).toBe("BOOTH_BUSY");
    expect(answers.filter((a) => a.body.outcome === "APPROVE").length).toBeGreaterThanOrEqual(3);
    expect(answers.every((a) => a.status === 200 || a.status === 503)).toBe(true);
  });

  it("does not hold the booth Mac in the line: its run starts at once, beside the one visitor the line lets through", async () => {
    const counting = countingJudge();
    const booth = await bootLan({ judge: counting.judge, sessionLimits: { runsAtOnce: 1 } });
    booths.push(booth);
    const phones = phonesOf(booth, 4);
    for (const p of phones) await p.info();
    const mac = macOf(booth);
    const visitors = Promise.all(phones.map((p) => p.run("normal")));
    await tick(10); // one visitor is at the judge, the others wait their turn
    const own = await mac.run("normal");
    expect(own.outcome).toBe("APPROVE");
    expect((await visitors).map((r) => r.outcome)).toEqual(Array(4).fill("APPROVE"));
    expect(counting.most()).toBe(2); // the Mac and one visitor at the judge together: with the Mac in the line this would be 1
  });
});
