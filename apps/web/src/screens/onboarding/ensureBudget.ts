// A budget exists when setup ends. The booth is read just now (another phone on the LAN may have sealed one while this one
// was setting up) and the ready-made budget is sealed only if it holds none. Goes through booth.exec, so a refusal shows the
// shell's message and seals nothing (I5); the answer says whether a budget is there.
import { m0Request } from "../../booth/compile";
import type { Booth } from "../../hooks/useBooth";
import { attempt } from "../../shell/actions";

export function ensureBudget(booth: Pick<Booth, "api" | "exec">): Promise<boolean> {
  return attempt(booth, async () => {
    const snap = await booth.api.snapshot();
    if (!snap.mandate) await booth.api.seal(m0Request(new Date()));
  });
}
