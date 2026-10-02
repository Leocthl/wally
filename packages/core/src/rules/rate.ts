// R7 velocity over a rolling window [F32] and R8 active cards below the rail maximum [F1.active].
import { THRESHOLD_REFS, type EngineConfig } from "../config";
import type { Mandate, PacketState } from "../generated";
import { MS_PER_S, judged, parseTime, timeOf, type RuleResult } from "./result";

export interface R7Input {
  readonly mandate: Mandate;
  readonly packet: PacketState;
  readonly now: Date;
  readonly config: EngineConfig;
}

/** Mints inside (now - window, now]; unreadable or future times count (fail closed). */
function mintsInWindow(mintTimes: readonly unknown[], nowMs: number | null, windowMs: number): number {
  return mintTimes.filter((t) => {
    const ms = parseTime(t);
    return ms === null || nowMs === null || nowMs - ms < windowMs;
  }).length;
}

/** R7: DENY R7.velocity unless approved mints in the window < max (mandate override, else F32). */
export function evaluateR7({ mandate, packet, now, config }: R7Input): RuleResult {
  const override = mandate.rules.velocity;
  const maxMints = override?.max_mints ?? config.velocity.max_mints;
  const windowS = override?.window_s ?? config.velocity.window_s;
  const count = mintsInWindow(packet.mint_times, timeOf(now), windowS * MS_PER_S);
  const inputs = { mints_in_window: count, max_mints: maxMints, window_s: windowS };
  const thresholdRef = override === undefined ? THRESHOLD_REFS.velocity : "mandate.rules.velocity.max_mints";
  return judged(count < maxMints, { id: "R7", inputs, comparator: "<", thresholdRef }, "DENY", "R7.velocity");
}

export interface R8Input {
  readonly packet: PacketState;
  readonly config: EngineConfig;
}

/** R8: DENY R8.max_active unless active cards < the rail maximum [F1.active]. */
export function evaluateR8({ packet, config }: R8Input): RuleResult {
  const active = packet.active_cards.length;
  const max = config.rail.max_active_cards;
  const inputs = { active_cards: active, max_active: max };
  return judged(active < max, { id: "R8", inputs, comparator: "<", thresholdRef: THRESHOLD_REFS.active }, "DENY", "R8.max_active");
}
