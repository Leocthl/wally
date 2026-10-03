// The UI state is a pure fold of trace events (no hidden state), so the same reducer serves the mock and the SSE client.
import { FakeClock } from "@wally/core/testing";
import { describe, expect, it } from "vitest";
import { MockApiClient } from "../src/api/MockApiClient";
import { m0SealRequest } from "../src/api/mock/presets";
import { fromSnapshot, initialState, reduce, type BoothAction, type BoothState } from "../src/state/booth";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

async function play(run: (c: MockApiClient) => Promise<void>): Promise<BoothState> {
  const clock = new FakeClock();
  const client = new MockApiClient({ clock, sleep: async () => undefined, pace: 0 });
  let state = initialState();
  client.subscribe((e) => {
    state = reduce(deepFreeze(state), e as BoothAction);
  });
  await client.seal(m0SealRequest(clock.now()));
  await run(client);
  return state;
}

describe("booth reducer", () => {
  it("folds a normal purchase into cards, packet, log and one finished run", async () => {
    const state = await play(async (c) => void (await c.runScenario("normal")));
    expect(state.cards).toHaveLength(1);
    expect(state.cards[0]?.state).toBe("USED");
    expect(state.packet?.remaining_minor).toBe(54_100);
    expect(state.log.entries.map((e) => e.kind)).toEqual(["MANDATE_SEALED", "DECISION", "CARD_MINTED", "CARD_EVENT"]);
    const run = state.runs[0];
    expect(run?.finished).toBe(true);
    expect(run?.outcome).toBe("APPROVE");
    expect(run?.stages.judge?.status).toBe("done");
    expect(run?.cardEvents.map((e) => e.beat)).toEqual(["exact"]);
  });

  it("keeps the declined overshoot on the same run as the live card, card still ACTIVE", async () => {
    const state = await play(async (c) => {
      await c.runScenario("mint");
      await c.runScenario("overshoot");
    });
    expect(state.cards[0]?.state).toBe("ACTIVE");
    expect(state.runs.at(-1)?.cardEvents[0]?.event.decline_code).toBe("OVER_LIMIT");
  });

  it("supersedes the approval when the checkout re-quote drifts (last decision is the R12 stop)", async () => {
    const state = await play(async (c) => void (await c.runScenario("drift")));
    const run = state.runs[0];
    expect(run?.decisions).toHaveLength(2);
    expect(run?.decisions.at(-1)?.explanation?.template_id).toBe("R12.price_drift");
    expect(state.cards[0]?.state).toBe("VOIDED");
  });

  it("tracks an escalation from OPEN to EXPIRED and puts R11 on the original run", async () => {
    const clock = new FakeClock();
    const client = new MockApiClient({ clock, sleep: async () => undefined, pace: 0 });
    let state = initialState();
    client.subscribe((e) => {
      state = reduce(state, e as BoothAction);
    });
    await client.seal(m0SealRequest(clock.now()));
    await client.runScenario("unverified");
    expect(state.escalations[0]?.state).toBe("OPEN");
    clock.advance(61_000);
    await client.sweepEscalations();
    expect(state.escalations[0]?.state).toBe("EXPIRED");
    expect(state.runs[0]?.decisions.at(-1)?.explanation?.template_id).toBe("R11.expired");
  });

  it("marks the mandate revoked and voids the card", async () => {
    const state = await play(async (c) => {
      await c.runScenario("revoke");
      await c.revoke();
    });
    expect(state.revoked).toBe(true);
    expect(state.cards[0]?.state).toBe("VOIDED");
    expect(state.packet?.status).toBe("REVOKED");
  });

  it("clears everything on reset", async () => {
    const state = await play(async (c) => {
      await c.runScenario("normal");
      await c.reset();
    });
    expect(state.runs).toHaveLength(0);
    expect(state.cards).toHaveLength(0);
    expect(state.packet?.remaining_minor).toBe(80_000);
    expect(state.log.entries).toHaveLength(1);
  });

  it("starts over when a new seal brings a different log: earlier log, cards, escalations and runs do not carry over", async () => {
    const clock = new FakeClock();
    const client = new MockApiClient({ clock, sleep: async () => undefined, pace: 0 });
    let state = initialState();
    client.subscribe((e) => {
      state = reduce(deepFreeze(state), e as BoothAction);
    });
    await client.seal(m0SealRequest(clock.now()));
    await client.runScenario("normal");
    await client.runScenario("unverified");
    const first = state;
    expect(first.cards).toHaveLength(1);
    expect(first.escalations).toHaveLength(1);
    expect(first.log.entries.length).toBeGreaterThan(1);
    expect(first.runs).toHaveLength(2);

    await client.seal(m0SealRequest(clock.now()));
    expect(state.packet?.log_id).not.toBe(first.packet?.log_id);
    expect(state.mandate?.id).not.toBe(first.mandate?.id);
    expect(state.cards).toEqual([]);
    expect(state.escalations).toEqual([]);
    expect(state.runs).toEqual([]);
    expect(state.log.entries.map((e) => e.kind)).toEqual(["MANDATE_SEALED"]);
    expect(state.log.entries.every((e) => e.log_id === state.packet?.log_id)).toBe(true);
    expect(state.packet?.remaining_minor).toBe(80_000);
  });

  it("keeps everything when the same seal is heard twice (same log)", async () => {
    const state = await play(async (c) => void (await c.runScenario("normal")));
    const again = reduce(state, { type: "mandate.sealed", mandate: state.mandate as NonNullable<BoothState["mandate"]>, packet: state.packet as NonNullable<BoothState["packet"]>, at: "2026-10-03T02:00:00Z" });
    expect(again.cards).toEqual(state.cards);
    expect(again.log.entries).toEqual(state.log.entries);
    expect(again.runs).toEqual(state.runs);
  });

  it("keeps the code and the earlier decision of a repeated cart on the run", () => {
    const at = "2026-10-03T02:00:00Z";
    const started = reduce(initialState(), { type: "run.started", runId: "run_1", scenario: "custom", at });
    const done = reduce(started, { type: "run.finished", runId: "run_1", outcome: "APPROVE", at, note: "again", code: "DUPLICATE", duplicateOf: "dec_1" });
    expect(done.runs[0]).toMatchObject({ finished: true, outcome: "APPROVE", code: "DUPLICATE", duplicateOf: "dec_1" });
  });

  it("does not mutate its input (frozen state survives every event)", async () => {
    await expect(play(async (c) => void (await c.runScenario("injected")))).resolves.toBeDefined();
  });

  it("restores a whole state from a snapshot", async () => {
    const clock = new FakeClock();
    const client = new MockApiClient({ clock, sleep: async () => undefined, pace: 0 });
    await client.seal(m0SealRequest(clock.now()));
    await client.runScenario("normal");
    const state = fromSnapshot(await client.snapshot());
    expect(state.cards).toHaveLength(1);
    expect(state.packet?.remaining_minor).toBe(54_100);
    expect(state.runs).toHaveLength(0);
  });
});
