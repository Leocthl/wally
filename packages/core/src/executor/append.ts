// Appends one CARD_EVENT through the injected AppendEntry. The executor holds no crypto: signing happens inside it.
import type { CardEvent } from "../ports";
import { describeError } from "./outcome";
import type { ExecutorDeps } from "./types";

export type AppendResult = { readonly ok: true; readonly seq: number } | { readonly ok: false; readonly message: string };

/** Never throws: a failed append is reported so the caller can surface it (the rail event already happened). */
export async function appendCardEvent(deps: ExecutorDeps, logId: string, event: CardEvent): Promise<AppendResult> {
  try {
    const entry = await deps.appendEntry(deps.store, deps.signer, logId, "CARD_EVENT", event, deps.clock.now());
    return { ok: true, seq: entry.seq };
  } catch (err) {
    return { ok: false, message: describeError(err) };
  }
}
