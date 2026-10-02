// Mandate views for the family tests: a parent ceiling like the demo's (HK$1,000, clothes, verified sellers) and small
// builders that change one term at a time. SIMULATED data; ids and keys are placeholders.
import type { Mandate } from "../src/generated";

export const NOW = new Date("2026-10-03T02:00:00Z");
export const PARENT_UNTIL = "2026-10-31T15:59:59Z";

type Rules = Mandate["rules"];
type Patch = Omit<Partial<Mandate>, "rules"> & { readonly rules?: Partial<Rules> };

export const PARENT: Mandate = {
  id: "mnd_parentP001",
  delegator: "did:key:z6MkParentKeyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  agent: "did:key:z6MkChildKeyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  intent_text: "HK$1,000 for clothes, verified sellers.",
  rules: {
    budget: { amount_minor: 100_000, currency: "HKD" },
    categories: ["apparel"],
    merchants: { allow: null, deny: [] },
    seller_check: { require_capture: true },
  },
  valid_from: "2026-10-03T01:59:00Z",
  valid_until: PARENT_UNTIL,
};

export function mandateWith(base: Mandate, patch: Patch): Mandate {
  const { rules, ...rest } = patch;
  return { ...base, ...rest, rules: { ...base.rules, ...rules } };
}

/** A child the same as the parent except for the given changes: it is inside the parent unless a change widens it. */
export function childWith(patch: Patch = {}, parent: Mandate = PARENT): Mandate {
  return mandateWith({ ...parent, id: "mnd_childC0001", delegator: parent.agent, agent: "did:key:z6MkAgentKeyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" }, patch);
}

export const budgetOf = (minor: number): Rules["budget"] => ({ amount_minor: minor, currency: "HKD" });
