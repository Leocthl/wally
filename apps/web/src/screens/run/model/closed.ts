// Whether the budget behind a screen is over, so a stop or an offer can lead to a new budget instead of to another ask. A
// cancelled or an ended budget buys nothing more; one that is only all used can be topped up, which the stops already offer.
import type { BoothState } from "../../../state/booth";

export type ClosedBudget = "cancelled" | "ended";

export function closedBudget(state: Pick<BoothState, "packet" | "revoked">): ClosedBudget | null {
  if (state.revoked || state.packet?.status === "REVOKED") return "cancelled";
  return state.packet?.status === "EXPIRED" ? "ended" : null;
}
