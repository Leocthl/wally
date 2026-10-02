// What a result file does and does not say. Written beside the numbers so a headline cannot be read as more than the harness
// measured: scenario counts from one seed, on a SIMULATED rail, with a log checked for integrity, not for consent.
import type { ComponentReport } from "../factory";

export interface ScopeInput {
  readonly n: number;
  readonly seed: number;
  readonly components: ComponentReport;
}

export function scopeNotes({ n, seed, components }: ScopeInput): readonly string[] {
  const standIns = Object.entries(components).filter(([, info]) => !info.real).map(([name]) => name);
  return [
    `Every number counts scenarios among the ${n} generated from seed ${seed}. A count of zero means none of those scenarios did it; it does not mean no scenario can.`,
    "Scenarios, rail and merchant are SIMULATED. No real card network, merchant or person is involved, and a real decline table is not applied.",
    "The limits are the harness's own bound for each scenario: the smaller of what the packet has left, the per-purchase cap and the rail ceiling. The harness does not measure whether a mandate matches what a person wanted.",
    "The signed log is checked for chain integrity: hashes, signatures and one DECISION per decision. It records what the engine decided. It does not by itself show that the delegator consented to a purchase.",
    "Judge numbers describe one judge checkpoint on the hand-written corpus and these scenarios. They are not a rate for listings in general.",
    standIns.length === 0 ? "Every component in this run is the real implementation." : `Stand-ins in this run: ${standIns.join(", ")}. A run with a stand-in is wiring evidence, not product evidence.`,
  ];
}
