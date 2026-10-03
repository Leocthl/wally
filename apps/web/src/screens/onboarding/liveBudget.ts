// Whether the booth already holds a budget Wally can shop in (the live booth seals one when it starts). One question, asked by the
// two steps that depend on it: "What can Wally buy for you?" (its ticks start a form only when there is none) and "Your first
// budget" (a form only when there is none). A budget that is cancelled, ended or all used is not that: the form is offered.
import type { BoothState } from "../../state/booth";

export function holdsLiveBudget(state: Pick<BoothState, "mandate" | "packet" | "revoked">): boolean {
  return state.mandate !== null && state.packet !== null && state.packet.status === "ACTIVE" && !state.revoked;
}
