// Scans serialized payloads for card data (I8): the rail handle and PAN-like digit runs. Hex hashes (64 chars) and
// did:key strings are removed first: they are long by design and hold no card data.
const HEX_HASH = /\b[0-9a-f]{64}\b/g;
const DID_KEY = /did:key:z[1-9A-HJ-NP-Za-km-z]+/g;
const PAN_LIKE = /(?:\d[ -]?){13,19}/;

export function panLikeIn(text: string): string | null {
  const cleaned = text.replace(HEX_HASH, "").replace(DID_KEY, "");
  return PAN_LIKE.exec(cleaned)?.[0] ?? null;
}
