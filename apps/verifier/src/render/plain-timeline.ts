// The receipts list in plain mode: per row a status disc, "Receipt 2", what it was ("Approved"), when (Hong Kong time)
// and whether it is untouched, changed or not checked. No kind name, no ISO time, no seq. The label is chosen from the
// unverified line in ../timeline.ts (a row built without one reads as "A receipt"); the status comes from the report.
// The window, gap lines, checkpoint row and stagger are the shell the two modes share (timeline.ts).
import { bi, el } from "../dom";
import { eventLabel } from "../plain/events";
import { hkTime } from "../plain/format";
import { gapLine, receiptName } from "../plain/phrases";
import { P } from "../plain/strings";
import type { RunResult } from "../run";
import type { Bi } from "../strings";
import type { TamperChange } from "../tamper";
import type { CheckpointStatus, RowStatus, TimelineRow } from "../timeline";
import { assembleTimeline, inOrder, statusDisc, statusWord } from "./timeline";

const WORD: Readonly<Record<RowStatus, Bi>> = { ok: P.rowUntouched, broken: P.rowChanged, unchecked: P.rowUnchecked };

const CHECKPOINT_TEXT: Readonly<Record<Exclude<CheckpointStatus, "none">, Bi>> = {
  ok: P.checkpointOk,
  broken: P.checkpointBroken,
  unchecked: P.checkpointUnchecked,
};

/** Children in the order a person says them: number, what, when, status. CSS places them on the row's grid. */
function plainRow(row: TimelineRow, position: number, change: TamperChange | null): HTMLElement {
  const tagged = change !== null && change.line === row.index + 1;
  return inOrder(
    el("li", { class: `row row--plain row--${row.status}`, role: "listitem", "data-index": String(row.index), "data-status": row.status }, [
      statusDisc(row.status),
      bi(receiptName(row.index + 1), "span", "row__seq"),
      bi(eventLabel(row.event ?? "other"), "span", "row__kind"),
      ...(row.ts === "" ? [] : [bi(hkTime(row.ts) ?? P.timeUnreadable, "span", "row__ts")]),
      statusWord(WORD[row.status]),
      ...(tagged ? [el("span", { class: "row__tag", "data-tampered": "true" }, [bi(P.changedTag)])] : []),
    ]),
    position,
  );
}

function plainCheckpointRow(status: Exclude<CheckpointStatus, "none">, position: number): HTMLElement {
  return inOrder(
    el("p", { class: `row row--${status} row--checkpoint`, "data-checkpoint": status }, [statusDisc(status), bi(CHECKPOINT_TEXT[status], "span", "row__text")]),
    position,
  );
}

export function renderPlainTimeline(result: RunResult | null, change: TamperChange | null): HTMLElement {
  if (result === null || result.kind !== "checked") return bi(P.noEntries, "p", "soft");
  return assembleTimeline(result.timeline, {
    row: (row, position) => plainRow(row, position, change),
    checkpoint: plainCheckpointRow,
    gap: (n, where) => bi(gapLine(n, where), "p", "soft gap"),
  });
}
