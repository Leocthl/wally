// Entry list: a status disc (tick, cross or dashed ring), seq, kind, time and the status word per entry; the entry
// Tamper changed is tagged. Long logs show a window around the first failure so the break is always on screen.
// Each row carries its position as --i and the list carries --step (both through the CSSOM, which the page's CSP
// allows), so motion.css can light the rows in one after another without an inline style attribute.
// assembleTimeline is the shell both display modes share (window, gap lines, checkpoint row, stagger); each mode brings
// its own rows and words (this file for developer mode, plain-timeline.ts for plain mode).
import { bi, el } from "../dom";
import { icon, type IconName } from "../icons";
import { LIMITS } from "../limits";
import { staggerStep } from "../motion";
import { changedByTamper, gapLine } from "../phrases";
import type { RunResult } from "../run";
import { S, type Bi } from "../strings";
import type { TamperChange } from "../tamper";
import type { CheckpointStatus, RowStatus, Timeline, TimelineRow } from "../timeline";

const LOOK: Readonly<Record<RowStatus, { readonly icon: IconName; readonly word: Bi }>> = {
  ok: { icon: "tick", word: S.rowOk },
  broken: { icon: "cross", word: S.rowBroken },
  unchecked: { icon: "ring", word: S.rowUnchecked },
};

export function statusDisc(status: RowStatus): HTMLElement {
  return el("span", { class: "row__disc" }, [icon(LOOK[status].icon, 16)]);
}

/** The status word keeps one span per language (row__en, row__zh); CSS shows one. */
export function statusWord(word: Bi): HTMLElement {
  return el("span", { class: "row__word" }, [el("span", { class: "row__en", lang: "en" }, [word.en]), el("span", { class: "row__zh", lang: "zh-HK" }, [word.zh])]);
}

export function inOrder(node: HTMLElement, position: number): HTMLElement {
  node.style.setProperty("--i", String(position));
  return node;
}

function rowItem(row: TimelineRow, position: number, change: TamperChange | null): HTMLElement {
  const tagged = change !== null && change.line === row.index + 1;
  return inOrder(
    el("li", { class: `row row--${row.status}`, role: "listitem", "data-index": String(row.index), "data-status": row.status }, [
      statusDisc(row.status),
      statusWord(LOOK[row.status].word),
      el("span", { class: "row__seq mono" }, [row.seq]),
      el("span", { class: "row__kind mono" }, [row.kind]),
      ...(row.ts === "" ? [] : [el("span", { class: "row__ts mono" }, [row.ts])]),
      ...(tagged ? [el("span", { class: "row__tag", "data-tampered": "true" }, [bi(changedByTamper(change.field))])] : []),
    ]),
    position,
  );
}

export interface RowWindow {
  readonly rows: readonly TimelineRow[];
  readonly before: number;
  readonly after: number;
}

export function windowAround(rows: readonly TimelineRow[]): RowWindow {
  if (rows.length <= LIMITS.timelineRows) return { rows, before: 0, after: 0 };
  const firstBad = rows.findIndex((r) => r.status !== "ok");
  const focus = firstBad < 0 ? rows.length - 1 : firstBad;
  const start = Math.max(0, Math.min(focus - Math.floor(LIMITS.timelineRows / 2), rows.length - LIMITS.timelineRows));
  return { rows: rows.slice(start, start + LIMITS.timelineRows), before: start, after: rows.length - start - LIMITS.timelineRows };
}

const CHECKPOINT_TEXT: Readonly<Record<Exclude<CheckpointStatus, "none">, Bi>> = {
  ok: S.checkpointOk,
  broken: S.checkpointBroken,
  unchecked: S.checkpointUnchecked,
};

function checkpointRow(status: Exclude<CheckpointStatus, "none">, position: number): HTMLElement {
  return inOrder(
    el("p", { class: `row row--${status} row--checkpoint`, "data-checkpoint": status }, [statusDisc(status), bi(CHECKPOINT_TEXT[status], "span", "row__text")]),
    position,
  );
}

/** What a display mode brings to the shared list: its rows, its checkpoint line and its "not shown" lines. */
export interface TimelineParts {
  readonly row: (row: TimelineRow, position: number) => HTMLElement;
  /** Never asked for "none": that row is not drawn. */
  readonly checkpoint: (status: Exclude<CheckpointStatus, "none">, position: number) => HTMLElement;
  readonly gap: (n: number, where: "earlier" | "later") => HTMLElement;
}

export function assembleTimeline(timeline: Timeline, parts: TimelineParts): HTMLElement {
  const view = windowAround(timeline.rows);
  const cp = timeline.checkpoint === "none" ? null : parts.checkpoint(timeline.checkpoint, view.rows.length);
  const gap = (n: number, where: "earlier" | "later"): readonly HTMLElement[] => (n > 0 ? [parts.gap(n, where)] : []);
  const list = el("ol", { class: "timeline", role: "list", "aria-labelledby": "timeline-title" }, view.rows.map((row, i) => parts.row(row, i)));
  const wrap = el("div", { class: "timeline-wrap" }, [...gap(view.before, "earlier"), list, ...gap(view.after, "later"), ...(cp ? [cp] : [])]);
  wrap.style.setProperty("--step", `${staggerStep(view.rows.length + (cp === null ? 0 : 1))}ms`);
  return wrap;
}

export function renderTimeline(result: RunResult | null, change: TamperChange | null): HTMLElement {
  if (result === null || result.kind !== "checked") return bi(S.noEntries, "p", "soft");
  return assembleTimeline(result.timeline, {
    row: (row, position) => rowItem(row, position, change),
    checkpoint: checkpointRow,
    gap: (n, where) => bi(gapLine(n, where), "p", "soft gap"),
  });
}
