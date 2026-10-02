// The Wally screen's model (pure): which state shows for recorded TraceEvent streams, plain reasons from the engine's
// own template and inputs, the "Why?" checks, and the card story for the DM2 beats.
import { describe, expect, it } from "vitest";
import type { Decision, TraceEvent } from "../src/api/types";
import { UI } from "../src/i18n/ui";
import { initialState, reduce, type BoothState } from "../src/state/booth";
import { chainOf, knownDecisions } from "../src/screens/run/model/chain";
import { checksFor } from "../src/screens/run/model/checks";
import { plainName } from "../src/screens/run/model/item";
import { engineLine, plainReason, ruleChip } from "../src/screens/run/model/reason";
import { history, selectScreen, type Result } from "../src/screens/run/model/screen";
import { stepsFor } from "../src/screens/run/model/steps";
import { coreInjectionDecision, openEscalationId, play, recorder, undecidedRun } from "./runTraces";

const R = UI.run;
const noRender = (): string => "unused";

function resultOf(state: BoothState, pinned?: string, afterRun?: string): Result {
  const model = selectScreen(state, pinned === undefined ? undefined : { id: pinned, ...(afterRun === undefined ? {} : { afterRun }) });
  if (model.kind !== "result") throw new Error(`expected a result, got ${model.kind}`);
  return model.result;
}

function fold(state: BoothState, events: readonly TraceEvent[]): BoothState {
  return events.reduce<BoothState>((s, e) => reduce(s, e), state);
}

describe("which state the Wally screen shows", () => {
  it("is idle before any run", async () => {
    const rec = await recorder();
    expect(selectScreen(rec.state()).kind).toBe("idle");
  });

  it("shows the steps while a run has not decided, then the approval once the run finishes", async () => {
    const rec = await play("normal");
    const cart = rec.events.findIndex((e) => e.type === "cart");
    const working = selectScreen(fold(initialState(), rec.events.slice(0, cart + 1)));
    expect(working.kind).toBe("working");
    if (working.kind === "working") {
      const steps = stepsFor(working.run);
      expect(steps.map((s) => s.status)).toEqual(["done", "waiting", "waiting", "waiting"]);
      expect(steps[0]?.detail).toEqual(R.stepPicked("Cotton tee"));
    }
    const minting = rec.events.findIndex((e) => e.type === "card.minted");
    expect(selectScreen(fold(initialState(), rec.events.slice(0, minting))).kind).toBe("working");
    const done = resultOf(rec.state());
    expect(done.kind).toBe("approved");
    expect(done.card?.state).toBe("USED");
    expect(done.story.map((s) => s.kind)).toEqual(["exact"]);
  });

  it("normal purchase: approved, paid the exact amount, one card at HK$259 [F21]", async () => {
    const r = resultOf((await play("normal")).state());
    expect(r.kind).toBe("approved");
    expect(r.card?.limit_minor).toBe(25_900);
    expect(r.story).toEqual([expect.objectContaining({ kind: "exact", amountMinor: 25_900, tone: "ok" })]);
  });

  it("mint only: approved with the card still ready (manual checkout, so Pay now applies)", async () => {
    const r = resultOf((await play("mint")).state());
    expect(r.kind).toBe("approved");
    expect(r.card?.state).toBe("ACTIVE");
    expect(r.story).toEqual([]);
    expect(r.busy).toBe(false);
  });

  it("DM2 beats on one card: charged more is declined (limit held), exact charge, used again is declined", async () => {
    const rec = await play("mint", "overshoot", "pay", "replay");
    const r = resultOf(rec.state());
    expect(r.kind).toBe("approved");
    expect(r.story.map((s) => s.kind)).toEqual(["overshoot", "exact", "replay"]);
    expect(r.story[0]?.amountMinor).toBeGreaterThan(r.card?.limit_minor ?? 0);
    expect(r.story.map((s) => s.tone)).toEqual(["held", "ok", "held"]);
  });

  it("wrong shop is declined; a timeout is retried once and charged once", async () => {
    expect(resultOf((await play("mint", "wrong_merchant")).state()).story.map((s) => s.kind)).toEqual(["wrong_shop"]);
    expect(resultOf((await play("mint", "timeout")).state()).story.map((s) => s.kind)).toEqual(["retry"]);
  });

  it("price drift: stopped by the checkout decision, the card cancelled, the story says the approval was voided", async () => {
    const r = resultOf((await play("mint", "drift")).state());
    expect(r.kind).toBe("stopped");
    expect(r.chain?.current.explanation?.template_id).toBe("R12.price_drift");
    expect(r.card?.state).toBe("VOIDED");
    expect(r.story.map((s) => s.kind)).toEqual(["drift"]);
    expect(plainReason(r.chain?.current as Decision)).toEqual(R.reasonR12);
  });

  it("flagged seller: stopped, plain reason and a named rule chip, no card", async () => {
    const r = resultOf((await play("flagged")).state());
    expect(r.kind).toBe("stopped");
    expect(r.card).toBeUndefined();
    const d = r.chain?.current as Decision;
    expect(plainReason(d)).toEqual(R.reasonR9Flagged);
    expect(ruleChip(d)).toEqual(R.chipR9);
  });

  it("overflow after a purchase: HK$550 against HK$541 left, from the engine's inputs [F22]", async () => {
    const r = resultOf((await play("normal", "overflow")).state());
    const reason = plainReason(r.chain?.current as Decision);
    expect(reason.en).toBe("It costs HK$550 with shipping, but only HK$541 is left in your budget.");
    expect(reason.zh).toContain("HK$550");
  });

  it("injected listing: stopped with the plain injection reason", async () => {
    const r = resultOf((await play("injected")).state());
    expect(plainReason(r.chain?.current as Decision)).toEqual(R.reasonR10Injection);
  });

  it("off-category item: stopped by your rules", async () => {
    const r = resultOf((await play("off_category")).state());
    expect(plainReason(r.chain?.current as Decision)).toEqual(R.reasonR6);
  });
});

describe("needs your OK", () => {
  it("opens with a countdown window and the plain reason", async () => {
    const r = resultOf((await play("unverified")).state());
    expect(r.kind).toBe("needsOk");
    expect(r.escalation?.state).toBe("OPEN");
    expect(plainReason(r.chain?.current as Decision)).toEqual(R.reasonR9Unverified);
  });

  it("approve: continues to approved, and the result remembers you said yes", async () => {
    const rec = await play("unverified");
    await rec.api.answerEscalation({ decisionId: await openEscalationId(rec), choice: "APPROVE" });
    const r = resultOf(rec.state());
    expect(r.kind).toBe("approved");
    expect(r.answer).toBe("yes");
    expect(r.card).toBeDefined();
  });

  it("no thanks: stopped, and the lead says you said no", async () => {
    const rec = await play("unverified");
    await rec.api.answerEscalation({ decisionId: await openEscalationId(rec), choice: "DENY" });
    const r = resultOf(rec.state());
    expect(r.kind).toBe("stopped");
    expect(r.answer).toBe("no");
    expect(r.card).toBeUndefined();
  });

  it("expiry: nobody answered in time, R11 stops it", async () => {
    const rec = await play("unverified");
    rec.clock.advance(61_000);
    await rec.api.sweepEscalations();
    const r = resultOf(rec.state());
    expect(r.kind).toBe("stopped");
    expect(r.answer).toBe("expired");
    expect(plainReason(r.chain?.current as Decision)).toEqual(R.nobodyAnswered);
  });

  it("judge unavailable: Wally's checker is offline, so it asks you first (R10.unavailable)", async () => {
    const rec = await recorder();
    await rec.api.propose({ listingText: "A plain cotton tee. ".repeat(260) });
    const r = resultOf(rec.state());
    expect(r.kind).toBe("needsOk");
    expect(r.chain?.current.explanation?.template_id).toBe("R10.unavailable");
    expect(plainReason(r.chain?.current as Decision)).toEqual(R.reasonR10Offline);
    const steps = r.run ? stepsFor(r.run) : [];
    expect(steps[1]?.detail).toEqual(R.stepReadOffline);
  });
});

describe("runs that decide nothing", () => {
  it("no proposal: a calm no-clear-pick state", async () => {
    const rec = await recorder();
    expect(resultOf(fold(rec.state(), undecidedRun("run_np", "INFO"))).kind).toBe("noPick");
  });

  it("an error fails closed to the error state, never a blank screen", async () => {
    const rec = await recorder();
    expect(resultOf(fold(rec.state(), undecidedRun("run_er", "ERROR"))).kind).toBe("error");
  });
});

describe("pinned purchases (#/wally?d=<id>)", () => {
  it("shows the pinned purchase over later runs that were already there when it was pinned", async () => {
    const rec = await play("flagged", "normal");
    const flagged = knownDecisions(rec.state()).find((d) => d.outcome === "DENY") as Decision;
    const latest = rec.state().runs.at(-1)?.runId;
    expect(resultOf(rec.state(), flagged.id, latest).kind).toBe("stopped");
    const reloaded: BoothState = { ...rec.state(), runs: [] };
    expect(resultOf(reloaded, flagged.id).chain?.root.id).toBe(flagged.id);
  });

  it("pins a resolution as its whole purchase (an answered question shows how it ended)", async () => {
    const rec = await play("unverified");
    await rec.api.answerEscalation({ decisionId: await openEscalationId(rec), choice: "DENY" });
    const [root, resolution] = knownDecisions(rec.state());
    const r = resultOf({ ...rec.state(), runs: [] }, resolution?.id);
    expect(r.chain?.root.id).toBe(root?.id);
    expect(r.kind).toBe("stopped");
  });

  it("an unknown id falls back to the latest run", async () => {
    const rec = await play("normal");
    expect(resultOf(rec.state(), "dec_nope").kind).toBe("approved");
  });

  it("a run started after the pin, about something else, takes the screen over", async () => {
    const rec = await play("flagged");
    const flagged = knownDecisions(rec.state())[0] as Decision;
    const latest = rec.state().runs.at(-1)?.runId;
    expect(resultOf(rec.state(), flagged.id, latest).kind).toBe("stopped");
    await rec.api.runScenario("normal");
    expect(resultOf(rec.state(), flagged.id, latest).kind).toBe("approved");
  });

  it("a run on the pinned purchase's own card keeps it on screen, live", async () => {
    const rec = await play("mint");
    const mint = knownDecisions(rec.state())[0] as Decision;
    const latest = rec.state().runs.at(-1)?.runId;
    await rec.api.runScenario("pay");
    const r = resultOf(rec.state(), mint.id, latest);
    expect(r.chain?.root.id).toBe(mint.id);
    expect(r.story.map((s) => s.kind)).toEqual(["exact"]);
  });

  it("history lists purchases newest first, one row per chain, without the one on screen", async () => {
    const rec = await play("normal", "flagged", "unverified");
    await rec.api.answerEscalation({ decisionId: await openEscalationId(rec), choice: "DENY" });
    const rows = history(rec.state(), 3);
    expect(rows.map((r) => r.kind)).toEqual(["stopped", "stopped", "approved"]);
    expect(rows[2]?.paid).toBe(true);
    expect(history(rec.state(), 3, rows[0]?.chain.root.id)).toHaveLength(2);
  });
});

describe("the Why sheet's checks", () => {
  it("approved: every group passes, in plain words with the budget figures", async () => {
    const r = resultOf((await play("normal")).state());
    const rows = checksFor(r.chain as NonNullable<Result["chain"]>);
    expect(rows.map((c) => c.id)).toEqual(["budget", "rules", "seller", "listing", "card"]);
    expect(rows.every((c) => c.status === "pass")).toBe(true);
    expect(rows[0]?.line).toEqual(R.budgetFits("HK$259", "HK$800"));
  });

  it("budget stop: the budget group stops and names the figures; seller still passes", async () => {
    const r = resultOf((await play("normal", "overflow")).state());
    const rows = checksFor(r.chain as NonNullable<Result["chain"]>);
    expect(rows.find((c) => c.id === "budget")).toMatchObject({ status: "stop", line: R.budgetOver("HK$550", "HK$541") });
    expect(rows.find((c) => c.id === "seller")?.status).toBe("pass");
  });

  it("question: the seller group asks you", async () => {
    const r = resultOf((await play("unverified")).state());
    expect(checksFor(r.chain as NonNullable<Result["chain"]>).find((c) => c.id === "seller")).toMatchObject({ status: "ask", line: R.sellerAsk });
  });

  it("price drift: the checkout price row appears and the budget check from the approval still shows", async () => {
    const r = resultOf((await play("mint", "drift")).state());
    const rows = checksFor(r.chain as NonNullable<Result["chain"]>);
    expect(rows.find((c) => c.id === "price")?.status).toBe("stop");
    expect(rows.find((c) => c.id === "budget")?.status).toBe("pass");
  });
});

describe("engine text in the Why sheet (the injection '?' bug)", () => {
  it("uses the engine's recorded sentence, so the core key p_injection_risk shows its figure", async () => {
    const rec = await play("normal");
    const approve = knownDecisions(rec.state())[0] as Decision;
    const core = coreInjectionDecision(approve);
    const en = engineLine(core, "en", noRender) ?? "";
    expect(en).toContain("0.92");
    expect(en).not.toContain("?");
    expect(engineLine(core, "zh-HK", noRender)).toContain("0.92");
    expect(checksFor({ root: core, decisions: [core], current: core }).find((c) => c.id === "listing")).toMatchObject({ status: "stop", line: R.listingInjection });
  });

  it("re-renders from the template only when the decision recorded no line", async () => {
    const rec = await play("injected");
    const d = knownDecisions(rec.state())[0] as Decision;
    const bare: Decision = { ...d, explanation: { template_id: "R10.injection", inputs: { p_injection_risk: 0.7, threshold: 0.39 }, rendered: "" } };
    expect(engineLine(bare, "en", (id, inputs) => `${id} ${String(inputs["p_injection_risk"])}`)).toBe("R10.injection 0.7");
  });
});

describe("display names", () => {
  it("drops the fixture's (SIMULATED) suffix; the screen shows a chip instead", () => {
    expect(plainName("Cotton tee (SIMULATED)")).toBe("Cotton tee");
    expect(plainName("(SIMULATED)")).toBe("(SIMULATED)");
  });

  it("chainOf returns undefined for an unknown id", async () => {
    expect(chainOf(knownDecisions((await recorder()).state()), "dec_x")).toBeUndefined();
  });
});
