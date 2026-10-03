// Real-stack helpers: the composed booth on the real orchestrator with an in-memory log, a seeded SIMULATED rail and
// ephemeral keys. Tests skip themselves while @wally/core/orchestrator is still the contract stub (lane e-orch).
import { createOrchestrator } from "@wally/core/orchestrator";
import { MemoryLogStore } from "@wally/core/testing";
import { seededRandom } from "@wally/rail-sim";
import { ephemeralKeys } from "../../../server/booth/keys";
import { composeBooth, type Booth } from "../../../server/compose";

export async function orchestratorIsReal(): Promise<boolean> {
  try {
    await createOrchestrator({} as never).snapshot();
    return true;
  } catch (err) {
    return !(err instanceof Error && /not implemented/.test(err.message));
  }
}

export async function layaUp(baseUrl = "http://127.0.0.1:8808"): Promise<boolean> {
  try {
    return (await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2_000) })).ok;
  } catch {
    return false;
  }
}

/** A started booth; env defaults to the replay judge and planner (deterministic, offline). */
export async function bootReal(env: Readonly<Record<string, string>> = {}, seed = 7): Promise<Booth> {
  const booth = composeBooth({
    env: { JUDGE_PROVIDER: "replay", PLANNER_PROVIDER: "replay", ...env },
    store: new MemoryLogStore(),
    railRandom: () => seededRandom(seed),
    keys: ephemeralKeys,
    tickMs: null,
    warmUp: env["JUDGE_PROVIDER"] === "laya",
  });
  await booth.start();
  return booth;
}
