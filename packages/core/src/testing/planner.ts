import type { PlannerContext, PlannerPort, PlannerStop, ProposeCartInput } from "../ports";

export type FakePlannerScript =
  | readonly (ProposeCartInput | null)[]
  | ((ctx: PlannerContext, callIndex: number) => ProposeCartInput | null);

export interface FakeAlternativeCall {
  readonly ctx: PlannerContext;
  readonly stop: PlannerStop;
}

/**
 * Scripted PlannerPort: returns the scripted proposals in order, then null. Never throws. With a second script it also
 * answers `alternatives` (after a budget stop) from that script and records the stops it was asked about; without
 * one the planner has no `alternatives` method at all, like a backend that does not replan.
 */
export class FakePlanner implements PlannerPort {
  readonly #script: FakePlannerScript;
  #calls: readonly PlannerContext[] = [];
  #alternativeCalls: readonly FakeAlternativeCall[] = [];
  readonly alternatives?: NonNullable<PlannerPort["alternatives"]>;

  constructor(script: FakePlannerScript, alternativesScript?: FakePlannerScript) {
    this.#script = script;
    if (alternativesScript !== undefined) {
      this.alternatives = async (ctx, stop, _opts) => {
        const index = this.#alternativeCalls.length;
        this.#alternativeCalls = [...this.#alternativeCalls, { ctx, stop }];
        if (typeof alternativesScript === "function") return alternativesScript(ctx, index);
        return alternativesScript[index] ?? null;
      };
    }
  }

  get calls(): readonly PlannerContext[] {
    return this.#calls;
  }

  get alternativeCalls(): readonly FakeAlternativeCall[] {
    return this.#alternativeCalls;
  }

  async propose(ctx: PlannerContext, _opts: { timeoutMs: number }): Promise<ProposeCartInput | null> {
    const index = this.#calls.length;
    this.#calls = [...this.#calls, ctx];
    if (typeof this.#script === "function") return this.#script(ctx, index);
    return this.#script[index] ?? null;
  }
}
