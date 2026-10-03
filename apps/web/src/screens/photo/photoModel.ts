// What the photo sheet lets the shopper change, as pure steps over the typed words (each returns a new value). The chips
// are the whole editing surface: the model's words are only a first guess, and the shopper has the last word on what
// Wally looks for. Nothing here is a decision about a purchase.
import { COLORS, MAX_COLORS, MAX_STYLES, PATTERNS, SHOP_KINDS, STYLES, type Color, type Fit, type Kind, type Pattern, type Style } from "@wally/agent/vision";
import type { SeeAttributes } from "../../api/types";

export const KIND_CHOICES: readonly Kind[] = SHOP_KINDS;
export const COLOR_CHOICES: readonly Color[] = COLORS;
export const PATTERN_CHOICES: readonly Pattern[] = PATTERNS;
export const FIT_CHOICES: readonly Exclude<Fit, "unknown">[] = ["slim", "regular", "relaxed", "oversized"];
export const STYLE_CHOICES: readonly Style[] = STYLES;

export const withKind = (a: SeeAttributes, kind: Kind): SeeAttributes => ({ ...a, kind });

/** Off when on; on when off. A fourth colour replaces the least dominant one (the last), so the chips never refuse a tap. */
export function withToggledColor(a: SeeAttributes, color: Color): SeeAttributes {
  if (a.colors.includes(color)) return { ...a, colors: a.colors.filter((c) => c !== color) };
  const kept = a.colors.length >= MAX_COLORS ? a.colors.slice(0, MAX_COLORS - 1) : a.colors;
  return { ...a, colors: [...kept, color] };
}

/** Same pattern again clears it (no preference). */
export const withPattern = (a: SeeAttributes, pattern: Pattern): SeeAttributes => ({ ...a, pattern: a.pattern === pattern ? null : pattern });

/** Same fit again clears it (no preference). */
export const withFit = (a: SeeAttributes, fit: Exclude<Fit, "unknown">): SeeAttributes => ({ ...a, fit: a.fit === fit ? null : fit });

export function withToggledStyle(a: SeeAttributes, style: Style): SeeAttributes {
  if (a.style.includes(style)) return { ...a, style: a.style.filter((s) => s !== style) };
  const kept = a.style.length >= MAX_STYLES ? a.style.slice(0, MAX_STYLES - 1) : a.style;
  return { ...a, style: [...kept, style] };
}

/** The same words in the same order: nothing changed, so there is nothing to look up again. */
export function sameAttributes(a: SeeAttributes, b: SeeAttributes): boolean {
  return a.kind === b.kind && a.pattern === b.pattern && a.fit === b.fit && a.colors.join() === b.colors.join() && a.style.join() === b.style.join();
}

/** The kind chip that is on: only the kinds the shop sells can be chips. */
export const chosenKind = (a: SeeAttributes): Kind | null => (a.kind !== null && KIND_CHOICES.includes(a.kind) ? a.kind : null);
