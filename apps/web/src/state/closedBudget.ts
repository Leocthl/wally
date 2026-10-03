// Whether the budget in a booth state is over: cancelled by the person, or ended by its date. A budget that is only all used
// is not over (it can be topped up). Shared by the reducer, which closes questions nobody can answer any more, and the screens,
// which lead to a new budget instead of another ask.
import type { BoothState } from "./booth";

export type ClosedBudget = "cancelled" | "ended";

export function closedBudget(state: Pick<BoothState, "packet" | "revoked">): ClosedBudget | null {
  if (state.revoked || state.packet?.status === "REVOKED") return "cancelled";
  return state.packet?.status === "EXPIRED" ? "ended" : null;
}
