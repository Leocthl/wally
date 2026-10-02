// Stretch: judge a long listing in overlapping windows so nothing falls past the 1,024-token row (F26).
// Each window gets its own call; the answers are merged conservatively: the worst window decides
// injection_risk, seller_risk and escalate_or_proceed, and the best window decides scope_fit (a clothing
// listing with a long unrelated tail is still a clothing listing). Whole distributions are taken from one
// window, never mixed label by label, so each question still sums to 1.
import type { JudgeAnswers } from "@laisee/core/generated";
import { DEFAULT_MAX_WINDOWS, DEFAULT_WINDOW_CHARS, DEFAULT_WINDOW_OVERLAP_CHARS } from "./config";
import type { ListingPart } from "./state";

export interface WindowingOptions {
  readonly windowChars: number;
  /** Neighbouring windows share this many characters, so a sentence shorter than this is whole in one window. */
  readonly overlapChars: number;
  /** More windows than this means the listing is not judged (ERROR, input_truncated). */
  readonly maxWindows: number;
}

export const DEFAULT_WINDOWING: WindowingOptions = {
  windowChars: DEFAULT_WINDOW_CHARS,
  overlapChars: DEFAULT_WINDOW_OVERLAP_CHARS,
  maxWindows: DEFAULT_MAX_WINDOWS,
};

export type WindowPlan = { readonly ok: true; readonly parts: readonly ListingPart[] } | { readonly ok: false; readonly reason: "too_many_windows" };

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff;

/** Moves a cut point off the middle of a surrogate pair (backwards, so progress is kept). */
function safeCut(text: string, at: number): number {
  return at > 0 && at < text.length && isLowSurrogate(text.charCodeAt(at)) && isHighSurrogate(text.charCodeAt(at - 1)) ? at - 1 : at;
}

export function splitListing(text: string, opts: WindowingOptions): WindowPlan {
  if (text.length <= opts.windowChars) return { ok: true, parts: [{ text, index: 0, total: 1 }] };
  const spans: { start: number; end: number }[] = [];
  let start = 0;
  for (;;) {
    const end = start + opts.windowChars >= text.length ? text.length : safeCut(text, start + opts.windowChars);
    spans.push({ start, end });
    if (end >= text.length) break;
    if (spans.length >= opts.maxWindows) return { ok: false, reason: "too_many_windows" };
    start = safeCut(text, Math.max(start + 1, end - opts.overlapChars));
  }
  return { ok: true, parts: spans.map((s, i) => ({ text: text.slice(s.start, s.end), index: i, total: spans.length })) };
}

function pickBy(list: readonly JudgeAnswers[], key: (a: JudgeAnswers) => number): JudgeAnswers {
  return list.reduce((best, a) => (key(a) > key(best) ? a : best));
}

/** Throws on an empty list: the caller always has at least one window. */
export function combineWindowAnswers(list: readonly JudgeAnswers[]): JudgeAnswers {
  if (list.length === 0) throw new Error("combineWindowAnswers needs at least one window");
  return {
    scope_fit: pickBy(list, (a) => a.scope_fit.in_scope).scope_fit,
    injection_risk: pickBy(list, (a) => a.injection_risk.suspicious + a.injection_risk.injection).injection_risk,
    seller_risk: pickBy(list, (a) => a.seller_risk.high_risk).seller_risk,
    escalate_or_proceed: pickBy(list, (a) => a.escalate_or_proceed.escalate).escalate_or_proceed,
  };
}
