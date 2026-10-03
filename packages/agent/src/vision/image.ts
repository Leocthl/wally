// What a picture is, read from its first bytes only (never from a file name or a claimed type): JPEG, PNG or WebP, and
// its size in pixels. The limits keep a huge or hostile file away from the model server. No decoding happens here, so
// nothing about the picture is kept; the page re-encodes pictures to a small JPEG before they leave the phone.

export type ImageMime = "image/jpeg" | "image/png" | "image/webp";

export interface ImageInfo {
  readonly mime: ImageMime;
  readonly width: number;
  readonly height: number;
}

/** Largest picture accepted, in bytes after decoding. A page-prepared picture (1024 px JPEG) is 100 to 300 kB. */
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
/** Largest picture accepted, in pixels (a 12 MP phone photo is fine; the model server decodes it in memory). */
export const MAX_IMAGE_PIXELS = 25_000_000;

export type ImageProblem = "empty" | "too_large" | "unsupported_type" | "bad_dimensions";

export type ImageCheck = { readonly ok: true; readonly info: ImageInfo } | { readonly ok: false; readonly reason: ImageProblem };

const ascii = (b: Uint8Array, at: number, text: string): boolean => [...text].every((c, i) => b[at + i] === c.charCodeAt(0));
const be16 = (b: Uint8Array, at: number): number => ((b[at] ?? 0) << 8) | (b[at + 1] ?? 0);
const be32 = (b: Uint8Array, at: number): number => (b[at] ?? 0) * 0x1000000 + (((b[at + 1] ?? 0) << 16) | ((b[at + 2] ?? 0) << 8) | (b[at + 3] ?? 0));
const le16 = (b: Uint8Array, at: number): number => (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8);
const le24 = (b: Uint8Array, at: number): number => (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8) | ((b[at + 2] ?? 0) << 16);

type Size = { readonly width: number; readonly height: number } | null;

/** Walks the JPEG segments to the frame header (SOF0..SOF15 except the table and extension markers). */
function jpegSize(b: Uint8Array): Size {
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    let marker = b[i + 1] ?? 0;
    while (marker === 0xff && i + 2 < b.length) {
      i += 1; // fill bytes
      marker = b[i + 1] ?? 0;
    }
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // markers without a length
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // end of image or start of scan before any frame header
    const length = be16(b, i + 2);
    if (length < 2) return null;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) return i + 8 < b.length ? { height: be16(b, i + 5), width: be16(b, i + 7) } : null;
    i += 2 + length;
  }
  return null;
}

function pngSize(b: Uint8Array): Size {
  return b.length >= 24 && ascii(b, 12, "IHDR") ? { width: be32(b, 16), height: be32(b, 20) } : null;
}

function webpSize(b: Uint8Array): Size {
  if (b.length < 25) return null;
  if (ascii(b, 12, "VP8X")) return b.length >= 30 ? { width: le24(b, 24) + 1, height: le24(b, 27) + 1 } : null;
  if (ascii(b, 12, "VP8L")) {
    const bits = (b[21] ?? 0) | ((b[22] ?? 0) << 8) | ((b[23] ?? 0) << 16) | ((b[24] ?? 0) << 24);
    return b[20] === 0x2f ? { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 } : null;
  }
  if (ascii(b, 12, "VP8 ")) return b.length >= 30 && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a ? { width: le16(b, 26) & 0x3fff, height: le16(b, 28) & 0x3fff } : null;
  return null;
}

/** Type and size from the bytes; null for anything that is not a complete-enough JPEG, PNG or WebP header. Never throws. */
export function sniffImage(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    const size = jpegSize(bytes);
    return size === null ? null : { mime: "image/jpeg", ...size };
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, "PNG\r\n") && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    const size = pngSize(bytes);
    return size === null ? null : { mime: "image/png", ...size };
  }
  if (bytes.length >= 12 && ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) {
    const size = webpSize(bytes);
    return size === null ? null : { mime: "image/webp", ...size };
  }
  return null;
}

/** The limits in order: not empty, not above the byte cap, an accepted type, a size that is neither zero nor huge. */
export function checkImage(bytes: Uint8Array): ImageCheck {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, reason: "too_large" };
  const info = sniffImage(bytes);
  if (info === null) return { ok: false, reason: "unsupported_type" };
  if (info.width < 1 || info.height < 1 || info.width * info.height > MAX_IMAGE_PIXELS) return { ok: false, reason: "bad_dimensions" };
  return { ok: true, info };
}
