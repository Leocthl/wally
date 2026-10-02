// Test helpers: the SIMULATED demo inputs and independent one-byte edits of the JSONL text (no page code used).
import { DEMO } from "../src/demo";

export const LOG = DEMO.log;
export const KEYS = DEMO.keys;
export const CHECKPOINT = DEMO.checkpoint;

/** The demo log lines without the final newline. */
export const LINES: readonly string[] = LOG.slice(0, -1).split("\n");

export const keysJson = (): { engine: string[]; delegator: string; agent: string; note: string } => JSON.parse(KEYS);

export function joinLines(lines: readonly string[]): string {
  return `${lines.join("\n")}\n`;
}

/** Header fields sorted before "payload" are found first; the ones after it last (JCS sorts keys). */
const BEFORE_PAYLOAD = new Set(["entry_hash", "kind", "log_id"]);

/** Offset of the first character of a top-level field's value in a canonical line. */
export function valueOffset(line: string, field: string): number {
  const key = `"${field}":`;
  const at = BEFORE_PAYLOAD.has(field) ? line.indexOf(key) : line.lastIndexOf(key);
  if (at < 0) throw new Error(`no ${field} in line`);
  return at + key.length;
}

/** Replace one character of the log text at an absolute offset. */
export function replaceAt(text: string, offset: number, char: string): string {
  if (char.length !== 1 || text[offset] === char) throw new Error("replaceAt must change exactly one character");
  return `${text.slice(0, offset)}${char}${text.slice(offset + 1)}`;
}

export function lineStart(text: string, index: number): number {
  let at = 0;
  for (let i = 0; i < index; i += 1) at = text.indexOf("\n", at) + 1;
  return at;
}

/** A different character of the same class (digit, hex, letter), so the line usually still parses. */
export function sibling(char: string): string {
  if (/[0-9]/.test(char)) return char === "0" ? "1" : "0";
  if (/[a-f]/.test(char)) return char === "a" ? "b" : "a";
  if (/[A-Z]/.test(char)) return char === "A" ? "B" : "A";
  return char === "x" ? "y" : "x";
}

/** Change one character `skip` characters into the value of `field` on line `index`. */
export function flipField(text: string, index: number, field: string, skip = 1): string {
  const start = lineStart(text, index);
  const line = text.slice(start, text.indexOf("\n", start));
  const offset = start + valueOffset(line, field) + skip;
  return replaceAt(text, offset, sibling(text[offset] ?? ""));
}
