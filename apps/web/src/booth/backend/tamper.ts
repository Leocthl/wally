// The Tamper demo (docs/06 DM7): a COPY of the log with one decimal digit of one amount changed ("one byte flipped").
// The stored log is never touched; verifying the copy must fail at the changed entry. Shared by the booth backend and
// the offline mock (src/api/mock/log.ts re-exports it).
import type { LogEntry, LogEntryKind } from "@laisee/core/generated";

export interface TamperedCopy {
  readonly entries: readonly LogEntry[];
  readonly seq: number;
  readonly field: string;
  readonly before: number;
  readonly after: number;
}

const TARGETS: readonly { readonly kind: LogEntryKind; readonly path: readonly string[] }[] = [
  { kind: "DECISION", path: ["cart", "total_minor"] },
  { kind: "CARD_MINTED", path: ["limit_minor"] },
  { kind: "CARD_EVENT", path: ["amount_minor"] },
  { kind: "MANDATE_SEALED", path: ["credentialSubject", "rules", "budget", "amount_minor"] },
];

function readPath(obj: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), obj);
}

function writePath(obj: unknown, path: readonly [string, ...string[]], value: number): unknown {
  const [head, ...rest] = path;
  const record = { ...(obj as Record<string, unknown>) };
  record[head] = rest.length === 0 ? value : writePath(record[head], rest as [string, ...string[]], value);
  return record;
}

/** One decimal digit changes ("one byte flipped"): the first digit of the amount goes up by one, wrapping 9 to 1. */
function flipLeadingDigit(value: number): number {
  const text = String(value);
  const digit = Number(text[0]);
  return Number(`${digit === 9 ? 1 : digit + 1}${text.slice(1)}`);
}

/** A tampered copy of the log; the stored log is untouched. Null when no entry carries an amount to change. */
export function tamperCopy(entries: readonly LogEntry[]): TamperedCopy | null {
  for (const target of TARGETS) {
    const index = entries.findIndex((e) => e.kind === target.kind && typeof readPath(e.payload, target.path) === "number");
    const entry = entries[index];
    if (index < 0 || !entry) continue;
    const before = readPath(entry.payload, target.path) as number;
    const after = flipLeadingDigit(before);
    const payload = writePath(entry.payload, target.path as [string, ...string[]], after);
    const changed = { ...entry, payload } as LogEntry;
    return {
      entries: entries.map((e, i) => (i === index ? changed : e)),
      seq: index,
      field: target.path.join("."),
      before,
      after,
    };
  }
  return null;
}
