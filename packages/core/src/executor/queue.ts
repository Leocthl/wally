// Per-key exclusive execution. The executor serialises work on one card so two concurrent checkouts cannot read
// the same attempt number, charge through the same key and log one rail answer twice. Different cards run in parallel.

export type Exclusive = <T>(key: string, task: () => Promise<T>) => Promise<T>;

export function createExclusive(): Exclusive {
  let tails: ReadonlyMap<string, Promise<void>> = new Map();
  return <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const previous = tails.get(key) ?? Promise.resolve();
    const run = previous.then(task);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    tails = new Map([...tails, [key, tail]]);
    void tail.then(() => {
      if (tails.get(key) === tail) tails = new Map([...tails].filter(([k]) => k !== key));
    });
    return run;
  };
}
