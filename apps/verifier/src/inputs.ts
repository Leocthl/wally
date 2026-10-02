// The three pasted inputs, validated at the page boundary. Fail closed: anything unreadable is an input error and
// the chain is never checked (so never PASS). The log text itself is passed on byte for byte, never trimmed.
import { parseCheckpoint, parsePublicKeys, type Checkpoint, type PublicKeys } from "@laisee/core/verify";
import { LIMITS } from "./limits";

export type Field = "log" | "keys" | "checkpoint";

export interface InputError {
  readonly field: Field;
  readonly message: string;
}

export type Read<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: InputError };

const bad = <T>(field: Field, message: string): Read<T> => ({ ok: false, error: { field, message } });
const count = (n: number): string => n.toLocaleString("en");

function tooBig(field: Field, label: string, length: number, cap: number): Read<never> | null {
  return length > cap ? bad(field, `${label} has ${count(length)} characters; this page reads up to ${count(cap)}.`) : null;
}

function parseJson(field: Field, label: string, text: string): Read<unknown> {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return bad(field, `${label} is not valid JSON.`);
  }
}

export function readLog(text: string): Read<string> {
  const big = tooBig("log", "The log", text.length, LIMITS.logChars);
  if (big) return big;
  if (text.trim() === "") return bad("log", "No log yet. Paste a log or load a file.");
  return { ok: true, value: text };
}

export function readKeys(text: string): Read<PublicKeys> {
  const big = tooBig("keys", "The public keys text", text.length, LIMITS.smallChars);
  if (big) return big;
  if (text.trim() === "") return bad("keys", "No public keys yet. Paste the public keys JSON or load the file.");
  const json = parseJson("keys", "The public keys text", text);
  if (!json.ok) return json;
  const parsed = parsePublicKeys(json.value);
  if (!parsed.ok) return bad("keys", `Public keys rejected: ${parsed.errors.map((e) => e.message).join("; ")}.`);
  return { ok: true, value: parsed.value };
}

/** Optional: blank means "no checkpoint". A checkpoint that is present but unreadable is an error, never skipped. */
export function readCheckpoint(text: string): Read<Checkpoint | undefined> {
  const big = tooBig("checkpoint", "The checkpoint text", text.length, LIMITS.smallChars);
  if (big) return big;
  if (text.trim() === "") return { ok: true, value: undefined };
  const json = parseJson("checkpoint", "The checkpoint text", text);
  if (!json.ok) return json;
  const parsed = parseCheckpoint(json.value);
  if (!parsed.ok) return bad("checkpoint", `Checkpoint rejected: ${parsed.errors.map((e) => e.message).join("; ")}.`);
  return { ok: true, value: parsed.value };
}
