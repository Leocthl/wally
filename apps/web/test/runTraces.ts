// Recorded TraceEvent sequences for the Wally screen tests: the offline MockApiClient (instant, FakeClock) plays a
// booth scenario and every event it emits is kept, so tests fold the same stream the screen folds.
import { FakeClock } from "@wally/core/testing";
import { render as coreRender } from "@wally/core/explain";
import type { Decision, RunOutcome, ScenarioId, TraceEvent } from "../src/api/types";
import { MockApiClient } from "../src/api/MockApiClient";
import { m0Request } from "../src/booth/compile";
import { initialState, reduce, type BoothState } from "../src/state/booth";

export interface Recording {
  readonly api: MockApiClient;
  readonly clock: FakeClock;
  readonly events: TraceEvent[];
  /** The folded state after everything recorded so far. */
  state(): BoothState;
}

export async function recorder(): Promise<Recording> {
  const clock = new FakeClock();
  const api = new MockApiClient({ clock, sleep: async () => undefined, pace: 0 });
  const events: TraceEvent[] = [];
  api.subscribe((e) => events.push(e));
  await api.seal(m0Request(clock.now()));
  return { api, clock, events, state: () => events.reduce<BoothState>((s, e) => reduce(s, e), initialState()) };
}

/** Plays booth scenarios in order and returns the recording. */
export async function play(...ids: readonly ScenarioId[]): Promise<Recording> {
  const rec = await recorder();
  for (const id of ids) {
    rec.clock.advance(1000);
    await rec.api.runScenario(id);
  }
  return rec;
}

export async function openEscalationId(rec: Recording): Promise<string> {
  const id = (await rec.api.snapshot()).escalations.at(-1)?.decisionId;
  if (!id) throw new Error("no escalation recorded");
  return id;
}

/** A run that finished without a decision: the planner made no proposal (INFO with a note), or an error. */
export function undecidedRun(runId: string, outcome: Extract<RunOutcome, "INFO" | "ERROR">, at = "2026-10-03T02:10:00Z"): TraceEvent[] {
  return [
    { type: "run.started", runId, scenario: "custom", at },
    { type: "stage", runId, stage: "planner", status: "running", at },
    ...(outcome === "INFO" ? [{ type: "stage", runId, stage: "planner", status: "done", latencyMs: 412, at } as const] : []),
    { type: "run.finished", runId, outcome, at, note: outcome === "INFO" ? "The planner made no proposal (ambiguous): it asks the shopper." : "planner timed out" },
  ];
}

/**
 * The injection stop as the real engine records it (input key p_injection_risk, rendered by core's own templates):
 * the old UI template read `p` and showed "?" for this figure.
 */
export function coreInjectionDecision(base: Decision): Decision {
  const inputs = { p_injection_risk: 0.92, threshold: 0.39, clean: 0.08, suspicious: 0.3, injection: 0.62, verdict: "DENY" };
  const rules = base.rules.map((r) =>
    r.id === "R10" && r.check === "injection_risk"
      ? { ...r, result: "FAIL" as const, verdict: "DENY" as const, inputs: { p_injection_risk: 0.92, threshold: 0.39 }, template_id: "R10.injection" as const }
      : r,
  ) as Decision["rules"];
  return {
    ...base,
    outcome: "DENY",
    rules,
    explanation: { template_id: "R10.injection", inputs, rendered: coreRender("R10.injection", inputs, "en"), rendered_zh_hk: coreRender("R10.injection", inputs, "zh-HK") },
  };
}
