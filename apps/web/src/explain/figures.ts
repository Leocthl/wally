// Gives every figure inside a rendered sentence its provenance (docs/04 "No bare number"). The renderer returns plain
// text (core's Render type), so figures are found by pattern and matched back to the recorded inputs by their formatted value.
// Input key names follow the schema convention: *_minor money, p / threshold for the judge, window_s / max for config.
import { formatHkd } from "../domain/money";
import { ASSUMED, SIMULATED, type Prov } from "../domain/provenance";
import { formatHkDateTime, formatHkTime } from "../domain/time";

export interface FigureContext {
  /** Amounts and times of the storyline: SIMULATED, or the cart's own tag. */
  readonly money: Prov;
  /** A judge probability: SIMULATED for a replay, MEASURED(n=1) for a live call. */
  readonly judge: Prov;
  /** Thresholds from the register are ASSUMED parameters (F36, F50). */
  readonly threshold: Prov;
  /** Windows and limits from config (F31, F32): ASSUMED. */
  readonly config: Prov;
  /** The rail ceiling, F1, still READ-BY-CLAUDE. */
  readonly register: Prov;
  /** Used when a figure cannot be matched to an input. The weakest honest claim for the active client. */
  readonly fallback: Prov;
}

export function figureContext(args: { readonly api: "mock" | "http"; readonly money: Prov; readonly judge: Prov }): FigureContext {
  return {
    money: args.money,
    judge: args.judge,
    threshold: ASSUMED,
    config: ASSUMED,
    register: { kind: "ASSUMED", suffix: "READ-BY-CLAUDE" },
    fallback: args.api === "mock" ? SIMULATED : ASSUMED,
  };
}

/** One recorded rule input as a figure, or null when it is not a quantity (ids, words, flags). */
export function inputFigure(key: string, value: unknown, ctx: FigureContext): { readonly text: string; readonly prov: Prov } | null {
  const [text] = formattings(key, value);
  return text ? { text, prov: classify(key, ctx) } : null;
}

export type Segment = { readonly figure: false; readonly text: string } | { readonly figure: true; readonly text: string; readonly prov: Prov };

const TOKEN = /\d{1,2}:\d{2}(?::\d{2})?|HK\$\d[\d,]*(?:\.\d+)?|(?<![A-Za-z$\d.])\d+(?:\.\d+)?(?:\s?(?:ms|min|h|s)\b|%)?/g;
const ISO = /^\d{4}-\d{2}-\d{2}T/;

function classify(key: string, ctx: FigureContext): Prov {
  if (/(^|_)threshold$|^T(_|$)/.test(key)) return ctx.threshold;
  if (key === "p" || /prob|risk|score/.test(key)) return ctx.judge;
  if (key === "ceiling_minor") return ctx.register;
  if (/^(max|window_s|max_age_s)$/.test(key)) return ctx.config;
  return ctx.money;
}

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

/** Windows and ages: "600 s" stays seconds, a day-sized age reads in hours ("41.1 h"). */
function seconds(value: number): string[] {
  const hours = value >= SECONDS_PER_HOUR ? [`${(value / SECONDS_PER_HOUR).toFixed(1)} h`] : [];
  return [...hours, `${value} s`, value % SECONDS_PER_MINUTE === 0 ? `${value / SECONDS_PER_MINUTE} min` : ""].filter(Boolean);
}

function formattings(key: string, value: unknown): string[] {
  if (typeof value === "string") return ISO.test(value) ? [key === "valid_until" ? `${formatHkDateTime(value)} UTC+8` : formatHkTime(value)] : [];
  if (typeof value !== "number" || !Number.isFinite(value)) return [];
  if (key.endsWith("_minor") && Number.isSafeInteger(value)) return [formatHkd(value)];
  if (key.endsWith("_s")) return seconds(value);
  return Number.isInteger(value) ? [String(value)] : [value.toFixed(2)];
}

function lookup(inputs: Readonly<Record<string, unknown>>, ctx: FigureContext): ReadonlyMap<string, Prov> {
  const map = new Map<string, Prov>();
  for (const [key, value] of Object.entries(inputs)) {
    for (const text of formattings(key, value)) if (!map.has(text)) map.set(text, classify(key, ctx));
  }
  return map;
}

export function annotate(text: string, inputs: Readonly<Record<string, unknown>>, ctx: FigureContext): readonly Segment[] {
  const known = lookup(inputs, ctx);
  const segments: Segment[] = [];
  let cursor = 0;
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    if (start > cursor) segments.push({ figure: false, text: text.slice(cursor, start) });
    segments.push({ figure: true, text: m[0], prov: known.get(m[0]) ?? known.get(m[0].replace(/\s?(ms|min|h|s|%)$/, "")) ?? ctx.fallback });
    cursor = start + m[0].length;
  }
  if (cursor < text.length) segments.push({ figure: false, text: text.slice(cursor) });
  return segments;
}
