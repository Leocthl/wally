import type { PlannerContext, PlannerPort, ProposeCartInput } from "../ports";

export type FakePlannerScript =
  | readonly (ProposeCartInput | null)[]
  | ((ctx: PlannerContext, callIndex: number) => ProposeCartInput | null);

/** Scripted PlannerPort: returns the scripted proposals in order, then null. Never throws. */
export class FakePlanner implements PlannerPort {
  readonly #script: FakePlannerScript;
  #calls: readonly PlannerContext[] = [];

  constructor(script: FakePlannerScript) {
    this.#script = script;
  }

  get calls(): readonly PlannerContext[] {
    return this.#calls;
  }

  async propose(ctx: PlannerContext, _opts: { timeoutMs: number }): Promise<ProposeCartInput | null> {
    const index = this.#calls.length;
    this.#calls = [...this.#calls, ctx];
    if (typeof this.#script === "function") return this.#script(ctx, index);
    return this.#script[index] ?? null;
  }
}
