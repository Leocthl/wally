// Builds the `state` JSON sent to the judge: intent text, a short rules summary, a short cart summary, the
// Scameter state and the listing. The listing text is untrusted data. It lives in one JSON field of its own
// (`listing.description`), where JSON string escaping stops it from adding or replacing fields, and it is never
// placed in a question's `instructions`.
//
// Why a nested object and not text markers: on the SIMULATED corpus (MEASURED(n=72), data/results/judge-fit-*)
// text markers such as `<<<LISTING TEXT BEGIN ...>>>` plus a note saying the text is untrusted cost injection
// separation (AUC 0.78 against 0.88), and the demo's clean listings were then denied. The thresholds in F36 were
// read off states shaped like this one (a mandate and a listing object), so this shape also keeps them valid.
import type { JudgeInput } from "@laisee/core/ports";
import { MAX_INLINE_TEXT_CHARS, MAX_INTENT_CHARS, MAX_SUMMARY_ITEMS } from "./config";

export interface ListingPart {
  readonly text: string;
  /** 0-based position of this window; a whole listing is index 0 of total 1. */
  readonly index: number;
  readonly total: number;
}

export interface JudgeState {
  readonly mandate: string;
  readonly rules: string;
  readonly cart: string;
  readonly scameter: string;
  readonly listing: {
    readonly title: string;
    readonly description: string;
    /** Only when the listing was split into windows: "2 of 3". */
    readonly part?: string;
  };
}

// C0 controls other than tab and newline, plus DEL.
// eslint-disable-next-line no-control-regex -- the point of this pattern is to match control characters
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Replaces control characters with spaces. Everything else, including odd Unicode, is left for the judge to see. */
export function stripControls(text: string): string {
  return text.replace(CONTROL_CHARS, " ");
}

/** One short line: controls stripped, whitespace collapsed, clipped. For strings that came from a listing record. */
export function cleanInline(text: string, max: number = MAX_INLINE_TEXT_CHARS): string {
  return stripControls(text).replace(/\s+/g, " ").trim().slice(0, max);
}

/** HKD minor units to "259.00" using integer arithmetic only. Anything that is not money prints "n/a". */
export function formatMoney(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor < 0) return "n/a";
  const cents = String(minor % 100).padStart(2, "0");
  return `${Math.floor(minor / 100)}.${cents}`;
}

const summariseRules = (rules: JudgeInput["rules"]): string => `categories: ${rules.categories.map((c) => cleanInline(c, 40)).join(", ")}`;

function itemLines(cart: JudgeInput["cart"]): readonly string[] {
  return cart.items.slice(0, MAX_SUMMARY_ITEMS).map((i) => `${i.qty} x ${cleanInline(i.title)}`);
}

function summariseCart(cart: JudgeInput["cart"]): string {
  const priced = cart.items.slice(0, MAX_SUMMARY_ITEMS).map((i) => `${i.qty} x ${cleanInline(i.title)} at HKD ${formatMoney(i.unit_price_minor)}`);
  return priced.join("; ");
}

const SCAMETER_TEXT: Readonly<Record<string, string>> = {
  FLAGGED: "flagged in scam reports",
  NO_RECORD: "no record found",
  NOT_CHECKED: "not checked",
};

export function buildJudgeState(input: JudgeInput, part: ListingPart): JudgeState {
  const title = itemLines(input.cart).join("; ");
  return {
    mandate: cleanInline(input.intentText, MAX_INTENT_CHARS),
    rules: summariseRules(input.rules),
    cart: summariseCart(input.cart),
    scameter: SCAMETER_TEXT[input.scameter.state] ?? "unknown",
    listing: {
      title: title.slice(0, MAX_INLINE_TEXT_CHARS),
      description: stripControls(part.text),
      ...(part.total > 1 ? { part: `${part.index + 1} of ${part.total}` } : {}),
    },
  };
}
