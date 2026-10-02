// A-21 calibration hook. A decline table maps each decline code to wording and timing (immediate or deferred),
// loaded from a JSON file so the one real observed decline [F40] drops in with no code change.
// The shipped default is SIMULATED (data/decline-table.default.json). Only OVER_LIMIT is calibrated by the real
// test; the other codes stay SIMULATED [F1]. Validated at load; anything unexpected fails closed.
import type { CardEvent } from "@laisee/core/ports";
import defaultTableJson from "../data/decline-table.default.json" with { type: "json" };

export const DECLINE_CODES = ["OVER_LIMIT", "CARD_USED", "CARD_VOIDED", "CARD_EXPIRED", "UNKNOWN_HANDLE", "MERCHANT_MISMATCH"] as const;
export type DeclineCode = (typeof DECLINE_CODES)[number];

// Compile-time guard: the table covers exactly the decline codes of the CardEvent schema.
type SchemaCode = NonNullable<CardEvent["decline_code"]>;
type SameCodes = [DeclineCode] extends [SchemaCode] ? ([SchemaCode] extends [DeclineCode] ? true : never) : never;
export const DECLINE_CODES_MATCH_SCHEMA: SameCodes = true;

export type DeclineTiming = "immediate" | "deferred";
export type DeclineShowsAt = "checkout_page" | "app" | "both" | "unknown";
export type DeclineHold = "none" | "shown" | "unknown";

export interface DeclineEntry {
  /** Text shown to the shopper. Copied verbatim from the observation when calibrated. */
  readonly wording: string;
  /** immediate: the decline is part of the authorise answer. deferred: it surfaces delay_ms later. */
  readonly timing: DeclineTiming;
  /** Deferred only: submit-to-decline time in ms (MEASURED(1) when it comes from the real test). */
  readonly delay_ms?: number;
  readonly shows_at: DeclineShowsAt;
  /** Whether the app showed a hold after the decline (data/real-card-test.md). */
  readonly hold: DeclineHold;
  /** SIMULATED, or OBSERVED(YYYY-MM-DD) once copied from a real capture. */
  readonly provenance: string;
}

export interface DeclineTable {
  readonly version: 1;
  readonly label: string;
  /** True only when OVER_LIMIT is OBSERVED. Anything else is sim-only and must be labelled so. */
  readonly calibrated: boolean;
  readonly entries: Readonly<Record<DeclineCode, DeclineEntry>>;
}

/** What the rail reports for a code. The rail is SIMULATED even when the wording is observed. */
export interface DeclineInfo extends DeclineEntry {
  readonly code: DeclineCode;
  readonly simulated: true;
}

export class DeclineTableError extends Error {
  constructor(message: string) {
    super(`decline table: ${message}`);
    this.name = "DeclineTableError";
  }
}

const TIMINGS: readonly DeclineTiming[] = ["immediate", "deferred"];
const SHOWS_AT: readonly DeclineShowsAt[] = ["checkout_page", "app", "both", "unknown"];
const HOLDS: readonly DeclineHold[] = ["none", "shown", "unknown"];
const PROVENANCE = /^(SIMULATED|OBSERVED\(\d{4}-\d{2}-\d{2}\))$/;
const PAN_LIKE = /(?:\d[ -]?){13,19}/;
const MAX_WORDING_CHARS = 200;
const MAX_LABEL_CHARS = 400;

function record(value: unknown, path: string, allowed: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new DeclineTableError(`${path} must be an object`);
  const extra = Object.keys(value).filter((k) => !allowed.includes(k));
  if (extra.length > 0) throw new DeclineTableError(`${path} has unknown keys: ${extra.join(", ")}`);
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string, max: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw new DeclineTableError(`${path} must be a string of 1 to ${max} characters`);
  }
  if (PAN_LIKE.test(value)) throw new DeclineTableError(`${path} contains a PAN-like digit run (I8)`);
  return value;
}

function choice<T extends string>(value: unknown, path: string, options: readonly T[]): T {
  const found = options.find((o) => o === value);
  if (found === undefined) throw new DeclineTableError(`${path} must be one of ${options.join(", ")}`);
  return found;
}

function parseEntry(value: unknown, path: string): DeclineEntry {
  const raw = record(value, path, ["wording", "timing", "delay_ms", "shows_at", "hold", "provenance"]);
  const timing = choice(raw["timing"], `${path}.timing`, TIMINGS);
  const delay = raw["delay_ms"];
  if (timing === "deferred" && !(typeof delay === "number" && Number.isSafeInteger(delay) && delay > 0)) {
    throw new DeclineTableError(`${path}.delay_ms must be a positive integer when timing is deferred`);
  }
  if (timing === "immediate" && delay !== undefined) throw new DeclineTableError(`${path}.delay_ms is only allowed when timing is deferred`);
  const provenance = raw["provenance"];
  if (typeof provenance !== "string" || !PROVENANCE.test(provenance)) {
    throw new DeclineTableError(`${path}.provenance must be SIMULATED or OBSERVED(YYYY-MM-DD)`);
  }
  return {
    wording: text(raw["wording"], `${path}.wording`, MAX_WORDING_CHARS),
    timing,
    ...(timing === "deferred" ? { delay_ms: delay as number } : {}),
    shows_at: choice(raw["shows_at"], `${path}.shows_at`, SHOWS_AT),
    hold: choice(raw["hold"], `${path}.hold`, HOLDS),
    provenance,
  };
}

/** Validates the calibration file contents. Throws DeclineTableError on anything unexpected (fail closed). */
export function parseDeclineTable(value: unknown): DeclineTable {
  const top = record(value, "$", ["version", "label", "declines"]);
  if (top["version"] !== 1) throw new DeclineTableError("$.version must be 1");
  const label = text(top["label"], "$.label", MAX_LABEL_CHARS);
  const declines = record(top["declines"], "$.declines", DECLINE_CODES);
  const missing = DECLINE_CODES.filter((code) => declines[code] === undefined);
  if (missing.length > 0) throw new DeclineTableError(`$.declines is missing: ${missing.join(", ")}`);
  const entries = Object.fromEntries(
    DECLINE_CODES.map((code) => [code, Object.freeze(parseEntry(declines[code], `$.declines.${code}`))]),
  ) as Record<DeclineCode, DeclineEntry>;
  const calibrated = entries.OVER_LIMIT.provenance.startsWith("OBSERVED(");
  return Object.freeze({ version: 1, label, calibrated, entries: Object.freeze(entries) });
}

/** The shipped SIMULATED table (data/decline-table.default.json). */
export const DEFAULT_DECLINE_TABLE: DeclineTable = parseDeclineTable(defaultTableJson);

export function describeDecline(table: DeclineTable, code: DeclineCode): DeclineInfo {
  return Object.freeze({ ...table.entries[code], code, simulated: true });
}
