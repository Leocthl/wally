// A budget exists when setup ends. The booth is read just now (another phone on the LAN may have sealed one while this one
// was setting up) and the ready-made budget is sealed only if it holds none. Goes through booth.exec, so a refusal shows the
// shell's message and seals nothing (I5); the answer says whether a budget is there.
import { chipsToRules, compileMandate, M0_SENTENCE, m0Request } from "../../booth/compile";
import type { Booth } from "../../hooks/useBooth";
import { attempt } from "../../shell/actions";

export function ensureBudget(booth: Pick<Booth, "api" | "exec">): Promise<boolean> {
  return attempt(booth, async () => {
    const snap = await booth.api.snapshot();
    if (!snap.mandate) await booth.api.seal(m0Request(new Date()));
  });
}

/** What Skip seals when there is no budget yet, in minor units: the booth's ready-made budget [F20], read from its own sentence. */
export function readyMadeBudgetMinor(now: Date = new Date()): number {
  return chipsToRules(compileMandate(M0_SENTENCE, now).chips).budget.amount_minor;
}
