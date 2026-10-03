// The line in front of the shared models. Every visitor has a wallet of its own now, so many runs can start in the same
// second, where the one shared wallet used to take them one at a time. Laya answers a decision in about 140 ms and handles
// them one after another, so twelve at once would queue inside it and the last would run past the judge deadline (1.5 s
// [F34]) and escalate for no reason but the crowd; Qwen has two slots. The visitors' wallets therefore take turns: a few
// runs at once, the rest wait here, before any deadline has started. The booth Mac's own wallet is not in the line.
// Web-standard APIs only.
import type { BoothBackend } from "./backend";

/** ASSUMED: runs of visitors in the planner and the judge at once. Two keeps Laya busy while the next request is parsed. */
export const MODEL_RUNS_AT_ONCE = 2;

/** At most `limit` tasks at once; the others start in the order they came, as a slot frees. */
export class Gate {
  readonly #limit: number;
  #running = 0;
  #line: readonly (() => void)[] = [];

  constructor(limit: number) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`a gate needs a whole limit of at least 1, got ${limit}`);
    this.#limit = limit;
  }

  /** Tasks waiting for a slot. */
  get waiting(): number {
    return this.#line.length;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.#enter();
    try {
      return await task();
    } finally {
      this.#leave();
    }
  }

  #enter(): Promise<void> {
    if (this.#running < this.#limit) {
      this.#running += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.#line = [...this.#line, resolve];
    });
  }

  #leave(): void {
    const [next, ...rest] = this.#line;
    if (next === undefined) {
      this.#running -= 1;
      return;
    }
    this.#line = rest;
    next(); // the slot goes straight to the next in line
  }
}

/** The operations that reach a shared model (the planner, the judge, the sentence reader, the picture reader). The rest are fast and local. */
const MODEL_OPERATIONS: ReadonlySet<string | symbol> = new Set(["runScenario", "propose", "ask", "suggestAlternatives", "answerEscalation", "compileRules", "see"]);

/** The same backend, whose model-reaching operations wait their turn in `gate`. Everything else passes straight through. */
export function gated(backend: BoothBackend, gate: Gate): BoothBackend {
  return new Proxy(backend, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      const call = value.bind(target) as (...args: unknown[]) => Promise<unknown>;
      return MODEL_OPERATIONS.has(prop) ? (...args: unknown[]) => gate.run(() => call(...args)) : call;
    },
  });
}
