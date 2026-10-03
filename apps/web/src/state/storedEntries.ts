// The stored log, recovered from a view of the changed copy. While the tamper demo is up, every client's view of the log
// (mock, on-device, booth server) carries the COPY in `entries` and says what it changed in `tampered`: which receipt,
// which amount, from what to what. The stored log is that copy with the one number put back. A page that loads while a
// copy is up (a reload, a second visitor) therefore still knows the stored receipts, so the screens that read them show
// the truth and only the screens that show the copy say it is a copy. Pure: the input is never changed. If the view does
// not describe the change it claims, nothing is guessed and the entries are returned as they came.
import type { LogEntry, LogView } from "../api/types";

type Copy = NonNullable<LogView["tampered"]>;

function readNumber(value: unknown, path: readonly string[]): number | undefined {
  const found = path.reduce<unknown>((acc, key) => (acc !== null && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), value);
  return typeof found === "number" ? found : undefined;
}

function writeNumber(value: unknown, path: readonly [string, ...string[]], number: number): unknown {
  const [head, ...rest] = path;
  const record = { ...(value as Record<string, unknown>) };
  record[head] = rest.length === 0 ? number : writeNumber(record[head], rest as [string, ...string[]], number);
  return record;
}

/** The entries of a view with its changed number put back; the view's own entries when it is not a view of a copy. */
export function storedEntries(view: Pick<LogView, "entries" | "tampered">): readonly LogEntry[] {
  const copy: Copy | null = view.tampered;
  if (copy === null) return view.entries;
  const index = view.entries.findIndex((e) => e.seq === copy.seq);
  const entry = view.entries[index];
  const path = copy.field.split(".");
  const [first, ...rest] = path;
  if (entry === undefined || first === undefined || readNumber(entry.payload, path) !== copy.after) return view.entries;
  const payload = writeNumber(entry.payload, [first, ...rest], copy.before);
  return view.entries.map((e, i) => (i === index ? ({ ...e, payload } as LogEntry) : e));
}
