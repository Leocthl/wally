// What the plain Evidence cards show, read from one loaded run: a handful of counts for each layer, every one with the
// chip of the file it came from. The three layers are an AI on its own (B0 in the file), rules only (B1: the hard rules R1-R8 and
// R12 with the card limit, no seller check and no listing check) and Wally (B2: the same plus both). Nothing is written here; a count the
// file does not carry is absent and its row, sentence or card is left out (fail closed: no chip or no k/n means no
// figure). The same loaded data feeds the developer view, so the two views never differ.
import { chipSampleSize, type FileChip } from "./chip";
import { wiringStatus } from "./select";
import type { BaselineId, HarnessRun, Rate } from "./types";

/** One count for each layer. Wally's is always there (a card is not drawn without it); the others when the file has them. */
export interface Layered {
  readonly wally: Rate;
  readonly rules: Rate | null;
  readonly alone: Rate | null;
}

export type Speed =
  | {
      readonly kind: "measured";
      readonly typicalMs: number;
      readonly nearlyAllMs: number;
      /** Typical time of the other two layers, when the file measured them. */
      readonly rulesTypicalMs: number | null;
      readonly aloneTypicalMs: number | null;
      readonly chip: FileChip;
    }
  | { readonly kind: "unmeasured"; readonly chip: FileChip }
  | { readonly kind: "absent" };

export interface PlainModel {
  /** Purchases in the run. */
  readonly total: number | null;
  /** The n of the run's chip: how many test purchases the label says. */
  readonly sampleN: number | null;
  /** Purchases that went over the budget or the card limit (counts of the bad thing: lower is better). */
  readonly limit: Layered | null;
  /** Risky purchases that were stopped before paying, of all risky purchases. */
  readonly risky: Layered | null;
  /** Trick listings that were stopped, of the set no fixed rule would stop (only the listing check can). */
  readonly tricks: Layered | null;
  /** Honest purchases that went through, of all honest purchases; the rest were blocked by mistake. */
  readonly honest: Layered | null;
  readonly speed: Speed;
  /** The listing check on its own on made-up trick listings: how many it let through. */
  readonly judgeMiss: Rate | null;
  /** Scenario categories that held purchases to stop, in the file's order. */
  readonly riskyKinds: readonly string[];
  /** Rules and the card limit alone kept every purchase under the limit, and Wally did too: the two are equal there. */
  readonly rulesHoldLimit: boolean;
  /** Rules alone let more trick listings through than Wally did: the listing check adds protection. */
  readonly listingCheckAdds: boolean;
  readonly wiringOnly: boolean;
  readonly mode: HarnessRun["mode"];
}

const rateOf = (run: HarnessRun, baseline: BaselineId, key: string): Rate | null => run.baselines[baseline]?.rates[key] ?? null;

/** A count of misses turned into the count of hits out of the same n, keeping the file's chip. */
const complement = (r: Rate): Rate => ({ k: r.n - r.k, n: r.n, chip: r.chip });

const usable = (r: Rate | null): r is Rate => r !== null && r.n > 0;

function layered(run: HarnessRun, key: string, turn: (r: Rate) => Rate): Layered | null {
  const wally = rateOf(run, "B2", key);
  if (!usable(wally)) return null;
  const rules = rateOf(run, "B1", key);
  const alone = rateOf(run, "B0", key);
  return { wally: turn(wally), rules: usable(rules) ? turn(rules) : null, alone: usable(alone) ? turn(alone) : null };
}

function typicalOf(run: HarnessRun, baseline: BaselineId): number | null {
  const latency = run.baselines[baseline]?.latency ?? null;
  return latency !== null && latency.measured ? latency.p50 : null;
}

function speedOf(run: HarnessRun): Speed {
  const latency = run.baselines.B2?.latency ?? null;
  if (latency === null) return { kind: "absent" };
  if (!latency.measured) return { kind: "unmeasured", chip: latency.chip };
  return { kind: "measured", typicalMs: latency.p50, nearlyAllMs: latency.p95, rulesTypicalMs: typicalOf(run, "B1"), aloneTypicalMs: typicalOf(run, "B0"), chip: latency.chip };
}

function riskyKindsOf(run: HarnessRun): readonly string[] {
  return (run.categories ?? []).flatMap((row) => {
    const cell = row.cells.B2 ?? row.cells.B0 ?? row.cells.B1;
    return cell !== undefined && cell.scenarios > cell.legitimate ? [row.category] : [];
  });
}

export function readPlain(run: HarnessRun): PlainModel {
  const limit = layered(run, "overspend_rate", (r) => r);
  const risky = layered(run, "stop_breach_rate", complement);
  const tricks = layered(run, "injection_pass_through_rate", complement);
  const honest = layered(run, "false_block_rate", complement);
  const anyChip = limit?.wally.chip ?? risky?.wally.chip ?? honest?.wally.chip ?? tricks?.wally.chip ?? null;
  return {
    total: run.baselines.B2?.scenarios ?? limit?.wally.n ?? null,
    sampleN: anyChip === null ? null : chipSampleSize(anyChip),
    limit,
    risky,
    tricks,
    honest,
    speed: speedOf(run),
    judgeMiss: run.injectionCorpus?.falseAllow ?? null,
    riskyKinds: riskyKindsOf(run),
    rulesHoldLimit: limit !== null && limit.rules !== null && limit.rules.k === 0 && limit.wally.k === 0,
    listingCheckAdds: tricks !== null && tricks.rules !== null && tricks.wally.k > tricks.rules.k,
    wiringOnly: wiringStatus(run).wiringOnly,
    mode: run.mode,
  };
}
