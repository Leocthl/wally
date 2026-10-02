// Guards for data/evidence/manual-route.json and captures.json (schemas in data/evidence/README.md). Humans fill these;
// a row that cannot be read is dropped and counted, never patched. Summaries use OBSERVED rows only.
import { asArr, asNum, asObj, asStr } from "./read";
import type { Parsed } from "./types";

export const MANUAL_SCHEMA = "laisee.evidence.manual-route/v1";
export const CAPTURES_SCHEMA = "laisee.evidence.captures/v1";

export type Tag = "OBSERVED" | "SIMULATED";

export interface RouteRun {
  readonly id: string;
  readonly runner: string;
  readonly at: string;
  readonly tag: Tag;
  readonly steps: number | null;
  readonly decideS: number | null;
  readonly issueS: number | null;
  readonly issueTag: Tag;
}

export interface Route {
  readonly id: string;
  readonly label: string;
  readonly runs: readonly RouteRun[];
}

export interface ManualRoute {
  readonly routes: readonly Route[];
  readonly droppedRows: number;
}

export interface Capture {
  readonly id: string;
  readonly registerRow: string;
  readonly what: string;
  readonly valueSeen: string;
  readonly at: string;
  readonly by: string;
  readonly redactedFile: string | null;
}

export interface RealDecline {
  readonly at: string;
  readonly code: string;
  readonly message: string;
  readonly where: string;
  readonly secondsToDecline: number | null;
  readonly redactedFile: string | null;
}

export interface Captures {
  readonly captures: readonly Capture[];
  readonly realDecline: RealDecline | null;
  readonly droppedRows: number;
}

const tagOf = (x: unknown): Tag | null => (x === "OBSERVED" || x === "SIMULATED" ? x : null);
const time = (x: unknown): string | null => {
  const s = asStr(x);
  return s !== null && !Number.isNaN(Date.parse(s)) ? s : null;
};

function readRun(x: unknown): RouteRun | null {
  const o = asObj(x);
  const id = asStr(o?.["id"]);
  const runner = asStr(o?.["runner"]);
  const at = time(o?.["at_utc8"]);
  const tag = tagOf(o?.["tag"]);
  // A timed run that completed a payment breaks the protocol (docs/05): it is not shown.
  if (o === null || id === null || runner === null || at === null || tag === null || o["payment_completed"] === true) return null;
  return { id, runner, at, tag, steps: asNum(o["steps"]), decideS: asNum(o["decide_s"]), issueS: asNum(o["issue_s"]), issueTag: tagOf(o["issue_tag"]) ?? tag };
}

export function parseManualRoute(raw: unknown): Parsed<ManualRoute> {
  const o = asObj(raw);
  const routes = asArr(o?.["routes"]);
  if (o === null || o["schema"] !== MANUAL_SCHEMA || routes === null) return { ok: false, file: "manual-route.json", problems: [`not a ${MANUAL_SCHEMA} file with a routes list`] };
  const parsed = routes.flatMap((r) => {
    const ro = asObj(r);
    const id = asStr(ro?.["id"]);
    if (ro === null || id === null) return [];
    const rows = asArr(ro["runs"]) ?? [];
    const runs = rows.flatMap((x) => readRun(x) ?? []);
    return [{ route: { id, label: asStr(ro["label"]) ?? "", runs }, dropped: rows.length - runs.length }];
  });
  return { ok: true, value: { routes: parsed.map((p) => p.route), droppedRows: parsed.reduce((sum, p) => sum + p.dropped, 0) } };
}

function readCapture(x: unknown): Capture | null {
  const o = asObj(x);
  const [id, registerRow, what, valueSeen, by] = ["id", "register_row", "what", "value_seen", "captured_by"].map((k) => asStr(o?.[k]));
  const at = time(o?.["captured_at_utc8"]);
  if (o === null || !id || !registerRow || !what || !valueSeen || !by || at === null) return null;
  return { id, registerRow, what, valueSeen, at, by, redactedFile: asStr(o["redacted_file"]) };
}

function readDecline(x: unknown): RealDecline | null {
  const o = asObj(x);
  const at = time(o?.["captured_at_utc8"]);
  const code = asStr(o?.["decline_code"]);
  if (o === null || at === null || code === null) return null;
  return { at, code, message: asStr(o["message"]) ?? "", where: asStr(o["where"]) ?? "", secondsToDecline: asNum(o["seconds_to_decline"]), redactedFile: asStr(o["redacted_file"]) };
}

export function parseCaptures(raw: unknown): Parsed<Captures> {
  const o = asObj(raw);
  const rows = asArr(o?.["captures"]);
  if (o === null || o["schema"] !== CAPTURES_SCHEMA || rows === null) return { ok: false, file: "captures.json", problems: [`not a ${CAPTURES_SCHEMA} file with a captures list`] };
  const captures = rows.flatMap((x) => readCapture(x) ?? []);
  const realDecline = o["real_decline"] === null || o["real_decline"] === undefined ? null : readDecline(o["real_decline"]);
  const declineDropped = o["real_decline"] != null && realDecline === null ? 1 : 0;
  return { ok: true, value: { captures, realDecline, droppedRows: rows.length - captures.length + declineDropped } };
}

export interface Spread {
  readonly n: number;
  readonly median: number;
  readonly min: number;
  readonly max: number;
}

export function spread(values: readonly number[]): Spread | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const median = s.length % 2 === 1 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
  return { n: s.length, median, min: s[0] as number, max: s[s.length - 1] as number };
}

/** F80: at least this many timed runs per route, by at least this many runners (ASSUMED register row). */
export const F80 = { minRuns: 3, minRunners: 2 } as const;

export function meetsSample(route: Route): boolean {
  const observed = route.runs.filter((r) => r.tag === "OBSERVED");
  return observed.length >= F80.minRuns && new Set(observed.map((r) => r.runner)).size >= F80.minRunners;
}
