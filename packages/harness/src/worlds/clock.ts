// The clock a scenario's world reads. Time moves only when the pipeline sets it, so results never depend on the wall clock.
import type { Clock } from "@wally/core/ports";

export class ScenarioClock implements Clock {
  #at: Date;

  constructor(start: Date) {
    this.#at = new Date(start.getTime());
  }

  now(): Date {
    return new Date(this.#at.getTime());
  }

  set(at: Date): void {
    this.#at = new Date(at.getTime());
  }
}
