// Injectable random and id sources, so tests and the harness can be deterministic (same seed, same cards).
// Ids are opaque. No generated token carries a long digit run, so nothing the rail emits can pass for a PAN (I8).
import { MAX_DIGIT_RUN } from "./config";

export interface RandomSource {
  /** Uniform integer in [0, maxExclusive). Throws RangeError unless maxExclusive is a positive integer. */
  nextInt(maxExclusive: number): number;
}

export interface IdSource {
  /** Card id, matches ^crd_[A-Za-z0-9]{6,40}$ (mandate.schema.json CardId). */
  cardId(): string;
  /** Opaque rail handle, matches ^hdl_[A-Za-z0-9_-]{16,64}$ (card-record.schema.json). */
  handle(): string;
}

const UINT32_RANGE = 0x1_0000_0000;

function assertBound(maxExclusive: number): void {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > UINT32_RANGE) {
    throw new RangeError(`nextInt needs an integer in [1, 2^32], got ${String(maxExclusive)}`);
  }
}

/** Production source: Web Crypto, with rejection sampling so every value is equally likely. */
export function cryptoRandom(): RandomSource {
  return {
    nextInt(maxExclusive: number): number {
      assertBound(maxExclusive);
      const limit = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive;
      const word = new Uint32Array(1);
      do {
        globalThis.crypto.getRandomValues(word);
      } while ((word[0] ?? 0) >= limit);
      return (word[0] ?? 0) % maxExclusive;
    },
  };
}

/** Deterministic source (mulberry32) for tests and seeded harness runs. Not for production use. */
export function seededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
  };
  return {
    nextInt(maxExclusive: number): number {
      assertBound(maxExclusive);
      return Math.floor(next() * maxExclusive);
    },
  };
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const ALPHANUMERIC = `${LETTERS}${DIGITS}`;

/** Random alphanumeric token whose longest digit run is MAX_DIGIT_RUN. */
function token(random: RandomSource, length: number): string {
  let out = "";
  let run = 0;
  for (let i = 0; i < length; i += 1) {
    const pool = run >= MAX_DIGIT_RUN ? LETTERS : ALPHANUMERIC;
    const ch = pool.charAt(random.nextInt(pool.length));
    run = DIGITS.includes(ch) ? run + 1 : 0;
    out += ch;
  }
  return out;
}

const CARD_ID_CHARS = 12;
const HANDLE_CHARS = 24;

export function createIdSource(random: RandomSource): IdSource {
  return {
    cardId: () => `crd_${token(random, CARD_ID_CHARS)}`,
    handle: () => `hdl_${token(random, HANDLE_CHARS)}`,
  };
}

/** Readable ids for demos and golden tests: crd_sim000001 and hdl_SIMULATEDhandle000001, counting up. */
export function sequentialIds(): IdSource {
  let cards = 0;
  let handles = 0;
  const pad = (n: number): string => String(n).padStart(6, "0");
  return {
    cardId: () => `crd_sim${pad((cards += 1))}`,
    handle: () => `hdl_SIMULATEDhandle${pad((handles += 1))}`,
  };
}
