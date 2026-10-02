// Tamper (DM7): flip ONE byte of a COPY of the log, in the first meaningful field found, deterministically.
// Order: a DECISION's approved limit, a CARD_MINTED limit, a CARD_EVENT amount, else the first entry's time.
// Digits flip by XOR 0x01 (0<->1, 2<->3, ...) so the line stays canonical JSON and the chain, not the parser,
// has to catch it. The original string is never changed; the caller keeps it for Restore.
import { parseLogText } from "@laisee/core/verify";
import { isRecord, ownField, ownInteger, ownString } from "./entry-fields";

export interface TamperChange {
  readonly seq: number;
  readonly kind: string;
  /** Dotted path in the entry, e.g. payload.approved_limit_minor. */
  readonly field: string;
  readonly what: string;
  readonly before: string;
  readonly after: string;
  /** 1-based line and column of the changed character; offset is its index in the whole text. */
  readonly line: number;
  readonly column: number;
  readonly offset: number;
  readonly fromChar: string;
  readonly toChar: string;
}

export type TamperResult = { readonly ok: true; readonly text: string; readonly change: TamperChange } | { readonly ok: false; readonly message: string };

interface Target {
  readonly kind: string | null;
  readonly path: readonly [string] | readonly [string, string];
  readonly what: string;
}

const TARGETS: readonly Target[] = [
  { kind: "DECISION", path: ["payload", "approved_limit_minor"], what: "approved limit (minor units)" },
  { kind: "CARD_MINTED", path: ["payload", "limit_minor"], what: "card limit (minor units)" },
  { kind: "CARD_EVENT", path: ["payload", "amount_minor"], what: "charged amount (minor units)" },
  { kind: null, path: ["ts"], what: "entry time" },
];

const MARK = "\u0000laisee-tamper-mark\u0000";
const NOTHING: TamperResult = { ok: false, message: "Nothing to tamper with: no readable entry with an amount or a time." };

function withValue(entry: Readonly<Record<string, unknown>>, path: Target["path"], value: unknown): Record<string, unknown> {
  if (path.length === 1) return { ...entry, [path[0]]: value };
  const inner = ownField(entry, path[0]);
  return { ...entry, [path[0]]: { ...(isRecord(inner) ? inner : {}), [path[1]]: value } };
}

function targetValue(entry: unknown, target: Target): number | string | undefined {
  if (target.path.length === 1) return ownString(entry, target.path[0]);
  return ownInteger(ownField(entry, target.path[0]), target.path[1]);
}

/** Index where the target value starts in the line; null unless the line round-trips through JSON.stringify. */
function valueStart(line: string, entry: Readonly<Record<string, unknown>>, target: Target): number | null {
  if (JSON.stringify(entry) !== line) return null;
  const at = JSON.stringify(withValue(entry, target.path, MARK)).indexOf(JSON.stringify(MARK));
  return at < 0 ? null : at;
}

/** Index (within the line) of the character to flip, and the value text before and after. */
function flipPoint(line: string, start: number, value: number | string): { readonly at: number; readonly before: string } | null {
  if (typeof value === "number") {
    const before = /^\d+/.exec(line.slice(start))?.[0] ?? "";
    if (before === "") return null;
    return { at: start + (before.length > 1 && before[0] === "1" ? 1 : 0), before };
  }
  const lastDigit = value.search(/\d(?=\D*$)/);
  return lastDigit < 0 ? null : { at: start + 1 + lastDigit, before: value };
}

/** Index of the first character of line `index` in the whole text (lines were split on "\n"). */
function lineStart(lines: readonly string[], index: number): number {
  return lines.slice(0, index).reduce((at, line) => at + line.length + 1, 0);
}

function locate(text: string, lines: readonly string[], index: number, entry: Readonly<Record<string, unknown>>, target: Target): TamperResult | null {
  const value = targetValue(entry, target);
  const line = lines[index] ?? "";
  const start = value === undefined ? null : valueStart(line, entry, target);
  const point = start === null || value === undefined ? null : flipPoint(line, start, value);
  if (point === null) return null;
  const fromChar = line[point.at] ?? "";
  const toChar = String.fromCharCode(fromChar.charCodeAt(0) ^ 1);
  const offset = lineStart(lines, index) + point.at;
  const valueAt = point.at - (start ?? 0) - (typeof value === "string" ? 1 : 0);
  const after = `${point.before.slice(0, valueAt)}${toChar}${point.before.slice(valueAt + 1)}`;
  const change: TamperChange = {
    seq: ownInteger(entry, "seq") ?? index,
    kind: ownString(entry, "kind") ?? "?",
    field: target.path.join("."),
    what: target.what,
    before: point.before,
    after,
    line: index + 1,
    column: point.at + 1,
    offset,
    fromChar,
    toChar,
  };
  return { ok: true, text: `${text.slice(0, offset)}${toChar}${text.slice(offset + 1)}`, change };
}

export function tamperLog(text: string): TamperResult {
  const parsed = parseLogText(text);
  const lines = text.split("\n");
  for (const target of TARGETS) {
    for (const [index, entry] of parsed.entries.entries()) {
      if (parsed.badLines.has(index) || !isRecord(entry)) continue;
      if (target.kind !== null && ownString(entry, "kind") !== target.kind) continue;
      const found = locate(text, lines, index, entry, target);
      if (found) return found;
    }
  }
  return NOTHING;
}
