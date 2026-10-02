// TEST DOUBLE for the model behind B0: an oracle that knows the scenario, so budget_fit is answered with exact arithmetic
// and the judge questions follow the keyword rules. B0's outcomes then depend on B0's structure, not on model noise.
import type { Scenario } from "../../src/types";
import type { ChoiceAnswer, ChoiceClient, ChoiceRequest } from "../../src/judge/choice-client";
import { FAKE_TRUNCATION_CHARS, isInjected } from "./keyword-model";

const pick = (labels: readonly string[], choice: string): ChoiceAnswer => ({
  choice,
  probabilities: Object.fromEntries(labels.map((l) => [l, l === choice ? 0.9 : 0.1 / (labels.length - 1)])),
});

export function truthFor(s: Scenario): Readonly<Record<string, string>> {
  const text = s.listing.text;
  const budget = s.cart.total_minor <= s.limits.allowedMinor ? "within_budget" : "over_budget";
  const scope = s.cart.items.some((i) => i.category !== "apparel") ? "out_of_scope" : "in_scope";
  const injection = isInjected(text) ? "injection" : "clean";
  const seller = /bank transfer|personal account/i.test(text) ? "high_risk" : "low_risk";
  const bad = budget !== "within_budget" || scope !== "in_scope" || injection !== "clean" || seller !== "low_risk";
  return { budget_fit: budget, scope_fit: scope, injection_risk: injection, seller_risk: seller, escalate_or_proceed: bad ? "escalate" : "proceed" };
}

export interface FakeModel extends ChoiceClient {
  readonly requests: () => readonly ChoiceRequest[];
}

export function fakeModelFor(s: Scenario, opts: { truncated?: boolean } = {}): FakeModel {
  let seen: readonly ChoiceRequest[] = [];
  const truth = truthFor(s);
  return {
    kind: "fake",
    requests: () => seen,
    async ask(req) {
      seen = [...seen, req];
      const answers = Object.fromEntries(req.questions.map((q) => [q.id, pick(q.options.map((o) => o.label), truth[q.id] ?? q.options[0]?.label ?? "")]));
      return { ok: true, answers, truncated: opts.truncated ?? s.listing.text.length > FAKE_TRUNCATION_CHARS, latencyMs: 7, meta: { model: "typed-decisions", revision: null } };
    },
  };
}
