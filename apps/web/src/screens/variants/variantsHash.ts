// The address of a variants page: #/styleguide/variants/<name>. Kept apart from the (dev-only) pages so the route gate
// can read it without importing them.
export const VARIANTS_HASH = /^#\/?styleguide\/variants\/([a-z0-9-]+)/;

export function variantName(hash: string): string | null {
  return VARIANTS_HASH.exec(hash)?.[1] ?? null;
}
