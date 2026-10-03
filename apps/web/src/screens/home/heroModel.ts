// What the Budget hero says about the budget, as pure functions of the packet (the folded state of the log). Wally's
// face follows it: the same facts the numbers show, in one word.
import type { PacketState } from "../../api/types";
import type { HeroMood } from "../../i18n/hero";
import type { WallyState } from "../../wally/Wally";

export type { HeroMood };

export function heroMood(packet: PacketState): HeroMood {
  if (packet.status === "REVOKED") return "cancelled";
  if (packet.status === "EXPIRED") return "ended";
  if (packet.status === "EXHAUSTED") return "usedUp";
  if (packet.open_escalations.length > 0) return "waiting";
  return packet.spent_minor === 0 && packet.committed_minor === 0 ? "fresh" : "going";
}

/** Waiting for an answer: thinking. Cancelled: the stop pose. Ended: asleep. All used: happy, it did its job. */
export const MOOD_POSE: Readonly<Record<HeroMood, WallyState>> = {
  fresh: "idle",
  going: "idle",
  waiting: "thinking",
  usedUp: "approved",
  cancelled: "stopped",
  ended: "offline",
};

export type Greeting = "none" | "intro" | "introNamed" | "named";

/**
 * What the bubble says before the mood line. A fresh budget introduces Wally (by name to a person who gave one); a budget
 * in use greets a person who gave a name; a cancelled or ended one speaks only the mood.
 */
export function greetingFor(mood: HeroMood, nickname: string): Greeting {
  if (mood === "fresh") return nickname === "" ? "intro" : "introNamed";
  if (nickname === "") return "none";
  return mood === "going" || mood === "waiting" || mood === "usedUp" ? "named" : "none";
}

export interface Shares {
  /** Each 0 to 1 of the budget; together at most 1. */
  readonly left: number;
  readonly held: number;
  readonly spent: number;
}

function share(part: number, whole: number): number {
  return Number.isFinite(part) && Number.isFinite(whole) && whole > 0 ? Math.min(1, Math.max(0, part / whole)) : 0;
}

export function shares(packet: PacketState): Shares {
  return {
    left: share(packet.remaining_minor, packet.budget_minor),
    held: share(packet.committed_minor, packet.budget_minor),
    spent: share(packet.spent_minor, packet.budget_minor),
  };
}
