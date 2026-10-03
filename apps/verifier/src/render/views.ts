// The three drawn parts of a run (the verdict, the Tamper note, the receipts list), for each display mode. app.ts picks
// one set by the mode in force and builds all three before swapping any of them in.
import type { Mode } from "../mode";
import type { RunResult } from "../run";
import type { TamperState } from "../state";
import type { TamperChange } from "../tamper";
import { renderPlainResult } from "./plain-result";
import { renderPlainTamperNote } from "./plain-tamper-note";
import { renderPlainTimeline } from "./plain-timeline";
import { renderResult } from "./result";
import { renderTamperNote } from "./tamper-note";
import { renderTimeline } from "./timeline";

export interface Views {
  readonly result: (result: RunResult | null) => HTMLElement;
  readonly note: (tamper: TamperState | null, logText: string, result: RunResult | null) => HTMLElement | null;
  readonly timeline: (result: RunResult | null, change: TamperChange | null) => HTMLElement;
}

export const VIEWS: Readonly<Record<Mode, Views>> = {
  developer: { result: renderResult, note: (tamper, logText) => renderTamperNote(tamper, logText), timeline: renderTimeline },
  plain: { result: renderPlainResult, note: (tamper, _logText, result) => renderPlainTamperNote(tamper, result), timeline: renderPlainTimeline },
};
