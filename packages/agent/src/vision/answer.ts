// Reads the model's JSON answer into Attributes. The answer is untrusted input, so only words from the fixed lists
// survive: an unknown kind makes the whole answer void (no description), an unknown colour, pattern, fit or style is
// dropped on its own, lists are capped, and every other key is ignored. Never throws.
import { isColor, isFit, isKind, isPattern, isStyle, MAX_COLORS, MAX_STYLES, type Attributes } from "./vocab";

/** The grammar makes an answer of about 40 tokens (under 200 characters); anything much longer is not from it. */
export const MAX_ANSWER_CHARS = 1_000;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value);

/** The known words of a list, in order, each once, at most `max`. */
function knownWords<T extends string>(raw: unknown, known: (value: unknown) => value is T, max: number): readonly T[] {
  if (!Array.isArray(raw)) return [];
  const words = raw.filter(known);
  return words.filter((word, index) => words.indexOf(word) === index).slice(0, max);
}

export function parseAttributes(raw: string): Attributes | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_ANSWER_CHARS) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const kind = value["kind"];
  if (!isKind(kind)) return null;
  const pattern = value["pattern"];
  const fit = value["fit"];
  return {
    kind,
    colors: knownWords(value["colors"], isColor, MAX_COLORS),
    pattern: isPattern(pattern) ? pattern : null,
    fit: isFit(fit) ? fit : "unknown",
    style: knownWords(value["style"], isStyle, MAX_STYLES),
  };
}
