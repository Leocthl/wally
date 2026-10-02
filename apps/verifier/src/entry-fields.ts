// Read display fields from an UNVERIFIED parsed line. Own properties only (no prototype lookups), typed checks,
// never throws. Used for the timeline labels and for Tamper; the verdict always comes from verifyLogText.
export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function ownField(value: unknown, key: string): unknown {
  return isRecord(value) && Object.hasOwn(value, key) ? value[key] : undefined;
}

export function ownString(value: unknown, key: string): string | undefined {
  const field = ownField(value, key);
  return typeof field === "string" ? field : undefined;
}

export function ownInteger(value: unknown, key: string): number | undefined {
  const field = ownField(value, key);
  return typeof field === "number" && Number.isSafeInteger(field) ? field : undefined;
}
