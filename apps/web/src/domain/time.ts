// Hong Kong time is UTC+8 with no daylight saving. Fixed arithmetic keeps tests independent of the host zone.

/** HKT = UTC+8. */
const HKT_OFFSET_MS = 8 * 60 * 60 * 1000;

function shifted(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new RangeError(`invalid timestamp ${iso}`);
  return new Date(ms + HKT_OFFSET_MS).toISOString();
}

/** "2026-10-03T02:05:00Z" -> "10:05:00" (HKT). */
export function formatHkTime(iso: string): string {
  return shifted(iso).slice(11, 19);
}

/** "2026-10-03T02:05:00Z" -> "2026-10-03 10:05" (HKT), the OBSERVED chip format (docs/04). */
export function formatHkDateTime(iso: string): string {
  return shifted(iso).slice(0, 16).replace("T", " ");
}

export function addMs(iso: string, ms: number): string {
  return new Date(Date.parse(iso) + ms).toISOString();
}

export function msBetween(fromIso: string, toIso: string): number {
  return Date.parse(toIso) - Date.parse(fromIso);
}
