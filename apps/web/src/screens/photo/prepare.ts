// Gets a picture ready on the phone, before anything leaves it: decode it (honouring the camera's rotation), shrink it so
// the long edge is 1024 px, and draw it on a canvas. Re-encoding that canvas as a JPEG drops every byte of metadata (EXIF,
// GPS, camera, time), so none of it can leave the phone. The dominant colours ("colour plates") are worked out from the
// same pixels, here, so they exist even where no model does. Browser only: canvas and createImageBitmap.
import { extractPalette, toBase64, type PaletteEntry } from "@wally/agent/vision";

/** Longest side sent on, in pixels. The model reads at most about 500 image tokens, so more pixels would not be read. */
export const TARGET_EDGE = 1024;
/** JPEG quality of the re-encoded picture (about 100 to 250 kB at this size). */
export const JPEG_QUALITY = 0.85;
/** ASSUMED: a source file larger than this is refused before decoding (a 48 MP phone photo is 5 to 15 MB). */
export const MAX_SOURCE_BYTES = 30 * 1024 * 1024;

export type PrepareProblem = "unreadable" | "too_large";

export class PrepareError extends Error {
  readonly reason: PrepareProblem;
  constructor(reason: PrepareProblem) {
    super(reason === "too_large" ? "That picture is too large." : "That file could not be read as a picture.");
    this.name = "PrepareError";
    this.reason = reason;
  }
}

export interface Prepared {
  /** The re-encoded JPEG, for showing the picture on this page only. */
  readonly blob: Blob;
  /** The same JPEG as base64, for the one call that reads it. */
  readonly data: string;
  readonly width: number;
  readonly height: number;
  readonly palette: readonly PaletteEntry[];
}

/** Scales (width, height) so the longer side is at most `edge`, never up. At least 1 px each way. */
export function fitWithin(width: number, height: number, edge: number = TARGET_EDGE): { readonly width: number; readonly height: number } {
  const longest = Math.max(width, height);
  const scale = longest > edge ? edge / longest : 1;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

interface Decoded {
  readonly source: CanvasImageSource;
  readonly width: number;
  readonly height: number;
  readonly release: () => void;
}

/** createImageBitmap applies the camera rotation; an <img> element is the fallback for browsers without it. */
async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // fall through to the element decoder
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new PrepareError("unreadable");
  }
}

const toJpeg = (canvas: HTMLCanvasElement): Promise<Blob | null> => new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));

export async function preparePhoto(file: File): Promise<Prepared> {
  if (file.size > MAX_SOURCE_BYTES) throw new PrepareError("too_large");
  if (file.type !== "" && !file.type.startsWith("image/")) throw new PrepareError("unreadable");
  const decoded = await decode(file);
  try {
    if (!(decoded.width > 0 && decoded.height > 0)) throw new PrepareError("unreadable");
    const { width, height } = fitWithin(decoded.width, decoded.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context === null) throw new PrepareError("unreadable");
    context.fillStyle = "#ffffff"; // a transparent screenshot would otherwise turn black in a JPEG
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = "high";
    context.drawImage(decoded.source, 0, 0, width, height);
    const palette = extractPalette(context.getImageData(0, 0, width, height));
    const blob = await toJpeg(canvas);
    if (blob === null) throw new PrepareError("unreadable");
    return { blob, data: toBase64(new Uint8Array(await blob.arrayBuffer())), width, height, palette };
  } finally {
    decoded.release();
  }
}
