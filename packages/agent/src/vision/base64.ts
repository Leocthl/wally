// Standard base64 (RFC 4648, with padding) for bytes, in chunks so a multi-megabyte picture never builds one huge
// argument list. Uses btoa, which every browser and Node has; no Buffer, so it runs anywhere.
const CHUNK = 0x8000;

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let at = 0; at < bytes.length; at += CHUNK) binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
  return btoa(binary);
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** The bytes of a standard base64 string, or null when it is not one (wrong characters, wrong length, whitespace). */
export function fromBase64(text: string): Uint8Array | null {
  if (typeof text !== "string" || text.length % 4 !== 0 || !BASE64.test(text)) return null;
  try {
    const binary = atob(text);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}
