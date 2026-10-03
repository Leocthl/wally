// Opaque ids and the wall clock for the booth backend. Web Crypto only (Node 22 and every browser have it).
import type { Clock } from "@wally/core/ports";

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export const SYSTEM_CLOCK: Clock = { now: () => new Date() };

/** Opaque ids with letters only (no digit runs anywhere near a card number, I8). */
export function randomId(prefix: string, length = 16): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length));
  return `${prefix}_${[...bytes].map((b) => ID_ALPHABET.charAt(b % ID_ALPHABET.length)).join("")}`;
}
