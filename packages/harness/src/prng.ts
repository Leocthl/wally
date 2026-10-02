// Seeded randomness for the scenario generator. mulberry32 plus FNV-1a; never Math.random, never a clock.

/** FNV-1a, 32 bit, over UTF-16 code units. Stable across platforms. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Sub-seed for scenario `index` of run `seed`: scenario i does not depend on how many scenarios are generated. */
export function deriveSeed(seed: number, index: number): number {
  return hashString(`${seed}/${index}`);
}

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** true with probability num/den (integers). */
  chance(num: number, den: number): boolean;
}

function assertSeed(seed: number): void {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError(`seed must be an integer in [0, 2^32), got ${seed}`);
  }
}

/** mulberry32. The closure holds the only mutable state; callers get a fresh Rng per scenario. */
export function createRng(seed: number): Rng {
  assertSeed(seed);
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min, max) {
      if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) throw new RangeError(`int(${min}, ${max})`);
      return min + Math.floor(next() * (max - min + 1));
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new RangeError("pick() from an empty list");
      return items[Math.floor(next() * items.length)] as T;
    },
    chance(num, den) {
      if (!Number.isInteger(num) || !Number.isInteger(den) || den <= 0) throw new RangeError(`chance(${num}, ${den})`);
      return next() * den < num;
    },
  };
}
