// Provenance chips as the result files carry them: MEASURED(n=...), RECORDED(...), SIMULATED, OBSERVED(...), ASSUMED.
// The text is shown verbatim. Anything else fails closed: the figure it belongs to is not shown (CLAUDE.md, docs/04).

export type ChipKind = "MEASURED" | "RECORDED" | "SIMULATED" | "OBSERVED" | "ASSUMED";

export interface FileChip {
  readonly kind: ChipKind;
  readonly text: string;
}

const PATTERN = /^(MEASURED|RECORDED|SIMULATED|OBSERVED|ASSUMED)(?:\((.+)\))?(?:\s.*)?$/;
const NEEDS_DETAIL: readonly ChipKind[] = ["MEASURED", "RECORDED", "OBSERVED"];

export function parseChip(raw: unknown): FileChip | null {
  if (typeof raw !== "string") return null;
  const m = PATTERN.exec(raw.trim());
  if (!m) return null;
  const kind = m[1] as ChipKind;
  const detail = m[2];
  if (NEEDS_DETAIL.includes(kind) && !detail) return null;
  // A measured or replayed figure must say how many samples it rests on (T-H3).
  if ((kind === "MEASURED" || kind === "RECORDED") && !/\bn=\d+/.test(detail ?? "")) return null;
  return { kind, text: raw.trim() };
}

export const SIMULATED_CHIP: FileChip = { kind: "SIMULATED", text: "SIMULATED" };
export const ASSUMED_CHIP: FileChip = { kind: "ASSUMED", text: "ASSUMED" };

/** MEASURED(n=k) for a summary we compute here over k OBSERVED runs. */
export function measuredChip(n: number): FileChip {
  if (!Number.isInteger(n) || n < 1) throw new RangeError("MEASURED needs n >= 1");
  return { kind: "MEASURED", text: `MEASURED(n=${n})` };
}

export const CHIP_CLASS: Readonly<Record<ChipKind, string>> = {
  MEASURED: "chip chip--meas",
  RECORDED: "chip chip--rec",
  SIMULATED: "chip chip--sim",
  OBSERVED: "chip chip--obs",
  ASSUMED: "chip chip--asm",
};
