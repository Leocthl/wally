// Joins class names, skipping empty values. Tiny on purpose: no dependency.
export function cx(...parts: readonly (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
