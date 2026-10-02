// Synthetic harness result files for the Evidence tests: a small valid file and helpers to vary it.
// Shapes follow laisee.harness.result/v1 as packages/harness writes it; values are invented for tests only.

type Json = Record<string, unknown>;

export const CHIP = "MEASURED(n=20, seed=1, commit=abcdef1)";

export const rate = (k: number, n: number, chip: string = CHIP): Json => ({ k, n, display: `${k}/${n}`, chip });

function baseline(overrides: Json = {}): Json {
  return {
    scenarios: 20,
    overspend_rate: rate(0, 20),
    over_limit_mint_rate: rate(0, 20),
    wrong_merchant_rate: rate(0, 12),
    false_block_rate: rate(1, 10),
    stop_breach_rate: rate(0, 8),
    injection_pass_through_rate: rate(0, 4),
    label_agreement_rate: rate(18, 20),
    latency: { measured: true, n: 20, p50_ms: 250.5, p95_ms: 690.2, chip: CHIP, scope: "judge + engine + mint" },
    ...overrides,
  };
}

const component = (real: boolean): Json => ({ name: "thing", real, note: real ? "the real one" : "a stand-in" });

export function harnessFile(overrides: Json = {}): Json {
  return {
    schema: "laisee.harness.result/v1",
    mode: "live",
    label: CHIP,
    provenance: "MEASURED on SIMULATED scenarios and a SIMULATED rail",
    run: { seed: 1, n: 20, commit: "abcdef1234", working_tree_dirty: false, run_at_utc8: "2026-10-03T09:00:00+08:00" },
    components: { engine: component(true), rail: component(true), judge: component(true) },
    evidence: { valid_as_product_evidence: true, reasons: [] },
    definitions: { B0: "model-only gate", B1: "rules and rail limit", B2: "full pipeline", system_descriptions: { B0: "model-only gate", B1: "rules, no judge", B2: "full pipeline" } },
    baselines: {
      B0: baseline({ overspend_rate: rate(4, 20), false_block_rate: rate(2, 10), latency: { measured: true, n: 20, p50_ms: 390, p95_ms: 1100, chip: CHIP } }),
      B1: baseline({ injection_pass_through_rate: rate(3, 4), latency: { measured: true, n: 20, p50_ms: 0.1, p95_ms: 0.2, chip: CHIP } }),
      B2: baseline(),
    },
    judge_false_allow: { false_allow_rate: rate(1, 6), tuning_split: rate(0, 3), heldout_split: rate(1, 3), not_evaluated: 0, unavailable_escalated: 1 },
    categories: [
      { category: "within_budget", B0: { scenarios: 6, legitimate: 6, completed: rate(5, 6), false_block: rate(1, 6) }, B1: { scenarios: 6, legitimate: 6, completed: rate(6, 6), false_block: rate(0, 6) }, B2: { scenarios: 6, legitimate: 6, completed: rate(5, 6), false_block: rate(1, 6) } },
    ],
    acceptance: [
      { id: "T-H1", target: "no over-limit mint or charge in the deterministic scenarios [F38]", evaluated_on: "B2", result: rate(0, 16), pass: true },
      { id: "T-H2", target: "legitimate scenarios approved at or above the target [F38]", evaluated_on: "B2", result: rate(9, 10), pass: true },
    ],
    scenarios: [
      { id: "s-01", category: "within_budget", variant: "plain", legitimate: true, expected: { decision: "APPROVE", rule: null }, B2: { decision: "DENY", rule: "R10", completed: false } },
      { id: "s-02", category: "within_budget", variant: "plain", legitimate: true, expected: { decision: "APPROVE", rule: null }, B2: { decision: "APPROVE", rule: null, completed: true } },
      { id: "s-03", category: "fx", variant: "over", legitimate: false, expected: { decision: "DENY", rule: "R3" }, B2: { decision: "DENY", rule: "R3", completed: false } },
    ],
    ...overrides,
  };
}

/** The same file as a wiring-only run: stand-ins and the file's own "not product evidence" flag. */
export function wiringFile(overrides: Json = {}): Json {
  return harnessFile({
    components: { engine: component(false), rail: component(true) },
    evidence: { valid_as_product_evidence: false, reasons: ["engine: a stand-in is not the real implementation"] },
    ...overrides,
  });
}

export function without(file: Json, key: string): Json {
  return Object.fromEntries(Object.entries(file).filter(([k]) => k !== key));
}
