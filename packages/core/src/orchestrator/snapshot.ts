// snapshot: the packet as the log tells it, read inside the queue so it never sees half a step. Cards carry no
// handle; escalations come with their state; the head checkpoint is the last entry's.
import { checkpointOf } from "../log/checkpoint";
import { now, readLogState, type Ctx, type Sealed } from "./context";
import { cardViews, escalationViews } from "./log-view";
import type { OrchestratorSnapshot } from "./types";

export const EMPTY_SNAPSHOT: OrchestratorSnapshot = Object.freeze({ mandate: null, packet: null, cards: [], escalations: [], log: [], head: null });

/** Inside the packet queue. Rejects (StepError) when the log cannot be read or folded. */
export async function snapshotInQueue(ctx: Ctx, sealed: Sealed): Promise<OrchestratorSnapshot> {
  const state = await readLogState(ctx, sealed.logId, now(ctx));
  const last = state.entries.at(-1);
  return {
    mandate: sealed.mandate,
    packet: state.packet,
    cards: cardViews(state.entries),
    // The packet is folded at snapshot time, so a budget that has run past its date is over here even before a tick logs it.
    escalations: escalationViews(state.entries, state.packet.status === "REVOKED" || state.packet.status === "EXPIRED"),
    log: state.entries,
    head: last === undefined ? null : checkpointOf(last),
  };
}
