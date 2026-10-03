// What "See cheaper options" tried when it found nothing: the item that was stopped for its price, and what the budget has left.
// Both are read from what the screen already knows (the newest budget stop, the packet), never worked out here.
import type { BoothState } from "../../../state/booth";
import { knownDecisions } from "./chain";
import { itemTitle } from "./item";
import { isBudgetStop } from "./stop";

export interface CheaperTried {
  readonly item: string;
  readonly leftMinor: number;
}

export function cheaperTried(state: BoothState): CheaperTried | null {
  const stopped = knownDecisions(state).filter((d) => d.outcome === "DENY" && isBudgetStop(d)).at(-1);
  const left = state.packet?.remaining_minor;
  return stopped === undefined || left === undefined ? null : { item: itemTitle(stopped.cart), leftMinor: left };
}
