import type { Clock } from "../ports";

export const FAKE_CLOCK_START = "2026-10-03T02:00:00Z";

/** Manual clock for tests. Time only moves when a test calls advance() or set(). */
export class FakeClock implements Clock {
  #ms: number;

  constructor(start: Date | string = FAKE_CLOCK_START) {
    this.#ms = toMs(start);
  }

  now(): Date {
    return new Date(this.#ms);
  }

  advance(ms: number): Date {
    if (!Number.isInteger(ms) || ms < 0) throw new RangeError(`advance(ms) needs a non-negative integer, got ${ms}`);
    this.#ms += ms;
    return this.now();
  }

  set(at: Date | string): Date {
    this.#ms = toMs(at);
    return this.now();
  }
}

function toMs(at: Date | string): number {
  const ms = new Date(at).getTime();
  if (Number.isNaN(ms)) throw new RangeError(`invalid time ${String(at)}`);
  return ms;
}
