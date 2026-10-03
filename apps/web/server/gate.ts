// The line in front of the shared models. Every visitor has a wallet of its own now, so many runs can start in the same
// second, where the one shared wallet used to take them one at a time. Laya answers a decision in about 140 ms and handles
// them one after another, so twelve at once would queue inside it and the last would run past the judge deadline (1.5 s
// [F34]) and escalate for no reason but the crowd; Qwen has two slots. The visitors' wallets therefore take turns: a few
// runs at once, the rest wait here, before any deadline has started. The booth Mac's own wallet is not in the line.
// Web-standard APIs only.
import type { BoothBackend } from "./backend";
import { BoothError } from "./http/errors";

/** ASSUMED: runs of visitors in the planner and the judge at once. Two keeps Laya busy while the next request is parsed. */
export const MODEL_RUNS_AT_ONCE = 2;
/** ASSUMED: runs that may wait in line. Twelve phones with a few taps each fit; more is a loop, and is told to try again. */
export const MODEL_LINE_LENGTH = 48;
/**
 * ASSUMED: log entries after which a visitor's wallet takes no more runs until the demo is started over. Every request reads
 * the whole log (MEASURED: about 0.8 ms per entry), so a loop of taps on one wallet made the whole booth slow (607 entries: a
 * second per request). A judge's session is dozens of entries.
 */
export const MAX_WALLET_ENTRIES = 200;

/** At most `limit` tasks at once; the others start in the order they came, as a slot frees. A longer line than `maxWaiting` is turned away. */
export class Gate {
  readonly #limit: number;
  readonly #maxWaiting: number;
  #running = 0;
  #line: readonly (() => void)[] = [];

  constructor(limit: number, maxWaiting = Number.POSITIVE_INFINITY) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`a gate needs a whole limit of at least 1, got ${limit}`);
    this.#limit = limit;
    this.#maxWaiting = maxWaiting;
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
    if (this.#line.length >= this.#maxWaiting) {
      return Promise.reject(new BoothError(503, "BOOTH_BUSY", "Wally is busy with other visitors right now. Try again in a moment."));
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

/**
 * The operations that run the planner and the judge, or read a sentence with the model. The rest are fast and local.
 * Reading a picture is not here: it has its own guard (one at a time for the whole booth, the next picture gets the colour
 * plates at once), and a slow read must not hold up the decisions of the visitors behind it.
 */
export const MODEL_OPERATIONS: ReadonlySet<keyof BoothBackend> = new Set<keyof BoothBackend>(["runScenario", "propose", "ask", "suggestAlternatives", "answerEscalation", "compileRules"]);

const isModelOperation = (prop: string | symbol): prop is keyof BoothBackend => (MODEL_OPERATIONS as ReadonlySet<string | symbol>).has(prop);

/**
 * The same backend, whose model-reaching operations wait their turn in `gate`. Everything else passes straight through. A
 * wallet takes one turn at a time (it runs one operation at a time anyway), so a phone that taps twice does not hold two of
 * the few places in line while its second tap waits behind its first. `refuse` can turn an operation away before it waits
 * (a wallet whose log is too long).
 */
export function gated(backend: BoothBackend, gate: Gate, refuse?: () => BoothError | null): BoothBackend {
  const own = new Gate(1);
  return new Proxy(backend, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      const call = value.bind(target) as (...args: unknown[]) => Promise<unknown>;
      if (!isModelOperation(prop)) return call;
      return (...args: unknown[]) => {
        const stop = refuse?.() ?? null;
        return stop === null ? own.run(() => gate.run(() => call(...args))) : Promise.reject(stop);
      };
    },
  });
}
