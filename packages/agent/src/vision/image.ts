// What a picture is, read from its first bytes only (never from a file name or a claimed type): a JPEG the model server's
// decoder can read, and its size in pixels. The limits keep a huge or hostile file away from the model server [F105]. No
// decoding happens here, so nothing about the picture is kept; the page re-encodes every picture to a small JPEG before it
// leaves the phone.
//
// JPEG only, on purpose: the page always sends one, and the model server's PNG decoder grows its output buffer without a
// bound set by the header, so a tiny PNG could make a shared server allocate gigabytes. WebP is not decoded there at all.

export type ImageMime = "image/jpeg";

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

const be16 = (b: Uint8Array, at: number): number => ((b[at] ?? 0) << 8) | (b[at + 1] ?? 0);

type Size = { readonly width: number; readonly height: number } | null;

/** Frame types the model server's decoder reads: SOF0 baseline, SOF1 extended sequential, SOF2 progressive (no lossless, no arithmetic coding). */
const READABLE_FRAMES: ReadonlySet<number> = new Set([0xc0, 0xc1, 0xc2]);
const isFrameMarker = (marker: number): boolean => marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

/** Walks the JPEG segments to the frame header; null when there is none, or when it is a type the decoder cannot read. */
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
    if (isFrameMarker(marker)) return READABLE_FRAMES.has(marker) && i + 8 < b.length ? { height: be16(b, i + 5), width: be16(b, i + 7) } : null;
    i += 2 + length;
  }
  return null;
}

/** Type and size from the bytes; null for anything that is not a complete-enough JPEG header. Never throws. */
export function sniffImage(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  const size = jpegSize(bytes);
  return size === null ? null : { mime: "image/jpeg", ...size };
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
