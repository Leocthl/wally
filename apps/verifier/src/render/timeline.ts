// Compact entry list: seq, kind, time and a tick, cross or "not checked" per entry; the entry Tamper changed is
// tagged. Long logs show a window around the first failure so the break is always on screen.
import { el } from "../dom";
import { icon, type IconName } from "../icons";
import { LIMITS } from "../limits";
import type { RunResult } from "../run";
import { S, type Bi } from "../strings";
import type { TamperChange } from "../tamper";
import type { CheckpointStatus, RowStatus, TimelineRow } from "../timeline";

const LOOK: Readonly<Record<RowStatus, { readonly icon: IconName; readonly word: Bi }>> = {
  ok: { icon: "pass", word: S.rowOk },
  broken: { icon: "fail", word: S.rowBroken },
  unchecked: { icon: "pending", word: S.rowUnchecked },
};

function statusCell(status: RowStatus): HTMLElement {
  const look = LOOK[status];
  return el("span", { class: "row__status" }, [icon(look.icon, 18), el("span", {}, [look.word.en]), el("span", { lang: "zh-HK", class: "row__zh" }, [look.word.zh])]);
}

function rowItem(row: TimelineRow, change: TamperChange | null): HTMLElement {
  const tagged = change !== null && change.line === row.index + 1;
  return el("li", { class: `row row--${row.status}`, "data-index": String(row.index), "data-status": row.status }, [
    statusCell(row.status),
    el("span", { class: "row__seq mono" }, [row.seq]),
    el("span", { class: "row__kind mono" }, [row.kind]),
    el("span", { class: "row__ts mono" }, [row.ts]),
    ...(tagged ? [el("span", { class: "row__tag", "data-tampered": "true" }, [`changed by Tamper: ${change.field}`])] : []),
  ]);
}

interface Window {
  readonly rows: readonly TimelineRow[];
  readonly before: number;
  readonly after: number;
}

function windowAround(rows: readonly TimelineRow[]): Window {
  if (rows.length <= LIMITS.timelineRows) return { rows, before: 0, after: 0 };
  const firstBad = rows.findIndex((r) => r.status !== "ok");
  const focus = firstBad < 0 ? rows.length - 1 : firstBad;
  const start = Math.max(0, Math.min(focus - Math.floor(LIMITS.timelineRows / 2), rows.length - LIMITS.timelineRows));
  return { rows: rows.slice(start, start + LIMITS.timelineRows), before: start, after: rows.length - start - LIMITS.timelineRows };
}

const CHECKPOINT_TEXT: Readonly<Record<Exclude<CheckpointStatus, "none">, string>> = {
  ok: "Head checkpoint matches.",
  broken: "Head checkpoint does not match: the log was cut short or rewritten.",
  unchecked: "Head checkpoint not checked: the chain broke first.",
};

function checkpointRow(status: CheckpointStatus): HTMLElement | null {
  if (status === "none") return null;
  const rowStatus: RowStatus = status === "ok" ? "ok" : status === "broken" ? "broken" : "unchecked";
  return el("p", { class: `row row--${rowStatus} row--checkpoint`, "data-checkpoint": status }, [statusCell(rowStatus), el("span", {}, [CHECKPOINT_TEXT[status]])]);
}

export function renderTimeline(result: RunResult | null, change: TamperChange | null): HTMLElement {
  if (result === null || result.kind !== "checked") return el("p", { class: "soft" }, ["No entries checked yet."]);
  const view = windowAround(result.timeline.rows);
  const gap = (n: number, where: string): readonly HTMLElement[] => (n > 0 ? [el("p", { class: "soft gap" }, [`${n} ${where} entries not shown.`])] : []);
  const list = el("ol", { class: "timeline", "aria-label": "Entries, in log order" }, view.rows.map((row) => rowItem(row, change)));
  const cp = checkpointRow(result.timeline.checkpoint);
  return el("div", { class: "timeline-wrap" }, [...gap(view.before, "earlier"), list, ...gap(view.after, "later"), ...(cp ? [cp] : [])]);
}
