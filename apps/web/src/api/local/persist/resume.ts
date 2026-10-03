// Opening the session again from a stored log, with no change to core. The orchestrator has no "resume": its seal refuses
// a log that already has entries, and it keeps nothing but the log. So the stored session is brought back by making the same
// seal again, which is exact because everything that goes into it is stored:
//   1. the stored keys: the engine key signs entries, and Ed25519 signing is deterministic (RFC 8032), so the same entry
//      content signed by the same key is the same signature;
//   2. the stored credential, passed to seal in place of the one the backend just signed (the backend still makes its own,
//      and it is thrown away): the seal verifies it against the pinned delegator like any seal;
//   3. the stored time, by a clock that stands still at the stored seq 0 `ts` for the length of the seal;
//   4. the store holding the stored log back (store.ts), which takes the whole log in when, and only when, the entry the
//      orchestrator appends is identical to the stored seq 0.
// What the seal then leaves is an orchestrator in the state of one that never reloaded: sealed, every entry delivered, the
// head checkpoint published. The rail is rebuilt first (rail.ts). Any difference anywhere fails the seal, the page drops this
// attempt and starts fresh.
import type { Orchestrator, OrchestratorDeps, SealResult } from "@wally/core/orchestrator";
import type { Clock } from "@wally/core/ports";
import type { SessionDeps } from "../../../booth/backend/session";
import type { RestorePlan } from "./plan";
import { PlaybackRandom, replayRail } from "./rail";

/** The page's clock, except that it can be made to stand still at one moment for a while. */
export class FreezableClock implements Clock {
  readonly #base: Clock;
  #frozen: Date | null = null;

  constructor(base: Clock) {
    this.#base = base;
  }

  freeze(at: Date): void {
    this.#frozen = new Date(at.getTime());
  }

  thaw(): void {
    this.#frozen = null;
  }

  now(): Date {
    return new Date((this.#frozen ?? this.#base.now()).getTime());
  }
}

const refused = (message: string): SealResult => ({ ok: false, runId: "run_resume", code: "LOG_INVALID", message });

interface Resuming {
  readonly rail: OrchestratorDeps["rail"];
  readonly playback: PlaybackRandom;
  readonly clock: FreezableClock;
  readonly plan: RestorePlan;
}

/** The orchestrator whose seal is the stored session's seal. Every other operation is the real one's. */
export function resumingOrchestrator(real: Orchestrator, resuming: Resuming): Orchestrator {
  const { plan, rail, playback, clock } = resuming;
  const first = plan.entries[0];
  return {
    ...real,
    async seal(_credential, options) {
      if (first === undefined) return refused("nothing is stored to resume");
      try {
        await replayRail(rail, playback, plan.entries);
      } catch (err) {
        return refused(`the rail could not be rebuilt: ${err instanceof Error ? err.message : "unknown error"}`);
      }
      clock.freeze(new Date(first.ts));
      try {
        const sealed = await real.seal(plan.credential, options);
        if (sealed.ok && (sealed.head.seq !== plan.head.seq || sealed.head.entry_hash !== plan.head.entry_hash)) return refused("the log after the seal does not end where the stored log ends");
        return sealed;
      } finally {
        clock.thaw();
      }
    },
  };
}

/**
 * Dependencies that resume `plan` on their first use and are the plain ones after it. The backend keeps one set of
 * dependencies for every seal made under the same keys (a Top up, a new budget after Cancel, a family scenario), so what
 * is special here must happen once: the first session built from them gets the stored mandate id, a rail whose ids are
 * played back and the orchestrator whose seal is the stored seal; every later session gets exactly what the plain
 * dependencies give. `openSession` asks for the random source before the orchestrator, so one flag turns both over.
 */
export function resumeDeps(deps: SessionDeps, plan: RestorePlan): SessionDeps {
  const playback = new PlaybackRandom(deps.random());
  let idGiven = false;
  let resumed = false;
  return {
    ...deps,
    random: () => (resumed ? deps.random() : playback),
    newId: (prefix) => {
      if (prefix !== "mnd" || idGiven) return deps.newId(prefix);
      idGiven = true;
      return plan.mandateId; // the log id comes from the mandate id: the stored log is log_<this>
    },
    createOrchestrator: (orchestratorDeps) => {
      if (resumed) return deps.createOrchestrator(orchestratorDeps);
      resumed = true;
      const clock = new FreezableClock(orchestratorDeps.clock);
      const real = deps.createOrchestrator({ ...orchestratorDeps, clock });
      return resumingOrchestrator(real, { rail: orchestratorDeps.rail, playback, clock, plan });
    },
  };
}
