// The four steps of a run in plain words: Wally picks (planner), Wally reads the listing (judge), Rules check
// (engine), One-off card (rail). Status comes from the trace stages and the engine's decision, never from a guess.
import type { Stage } from "../../../api/types";
import { formatHkd } from "../../../domain/money";
import type { LabelPair } from "../../../i18n/label";
import { UI } from "../../../i18n/ui";
import type { StepStatus } from "../../../ui/Steps";
import { currentDecision, type RunView, type StageView } from "../../../state/booth";
import { itemTitle } from "./item";

const R = UI.run;

export interface RunStep {
  readonly id: Stage;
  readonly title: LabelPair;
  readonly detail: LabelPair;
  readonly status: StepStatus;
  readonly latencyMs?: number;
}

function base(view: StageView | undefined): StepStatus {
  if (!view) return "waiting";
  if (view.status === "running") return "now";
  if (view.status === "error") return "stop";
  return "done";
}

function pick(run: RunView): RunStep {
  const view = run.stages.planner;
  const title = run.cart ? itemTitle(run.cart) : undefined;
  return { id: "planner", title: R.stepPick, detail: title ? R.stepPicked(title) : R.stepPickNow, status: base(view), ...latency(view) };
}

function read(run: RunView): RunStep {
  const view = run.stages.judge;
  const offline = run.judge !== undefined && run.judge.status !== "OK";
  return { id: "judge", title: R.stepRead, detail: offline ? R.stepReadOffline : R.stepReadDetail, status: base(view), ...latency(view) };
}

function rules(run: RunView): RunStep {
  const view = run.stages.engine;
  const decision = run.decisions[0];
  const status: StepStatus = !decision ? base(view) : decision.outcome === "DENY" ? "stop" : decision.outcome === "ESCALATE" ? "now" : "done";
  const detail = !decision ? R.stepRulesDetail : decision.outcome === "DENY" ? R.stoppedTitle : decision.outcome === "ESCALATE" ? R.needsOkTitle : R.stepRulesPass;
  return { id: "engine", title: R.stepRules, detail, status, ...latency(view) };
}

function card(run: RunView): RunStep {
  const view = run.stages.rail;
  const decision = currentDecision(run);
  if (run.mintedCard) return { id: "rail", title: R.stepCard, detail: R.worksOnce(formatHkd(run.mintedCard.limit_minor)), status: "done", ...latency(view) };
  if (decision?.outcome === "DENY") return { id: "rail", title: R.stepCard, detail: R.stepCardNone, status: "stop" };
  if (decision?.outcome === "ESCALATE") return { id: "rail", title: R.stepCard, detail: R.stepCardWait, status: "waiting" };
  if (view?.status === "error") return { id: "rail", title: R.stepCard, detail: R.stepFailed, status: "stop" };
  return { id: "rail", title: R.stepCard, detail: view?.status === "running" ? R.stepCardNow : R.stepCardDetail, status: base(view), ...latency(view) };
}

function latency(view: StageView | undefined): { readonly latencyMs?: number } {
  return view?.status === "done" && view.latencyMs !== undefined ? { latencyMs: view.latencyMs } : {};
}

export function stepsFor(run: RunView): readonly RunStep[] {
  return [pick(run), read(run), rules(run), card(run)];
}

/** The step a screen reader hears about: the one in progress, else the last one that finished. */
export function activeStep(steps: readonly RunStep[]): { readonly index: number; readonly step: RunStep } | undefined {
  const now = steps.findIndex((s) => s.status === "now");
  if (now >= 0) return { index: now, step: steps[now] as RunStep };
  const done = steps.map((s) => s.status).lastIndexOf("done");
  return done >= 0 ? { index: done, step: steps[done] as RunStep } : undefined;
}
