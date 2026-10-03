// Test support: decodes an 8-bit, non-interlaced RGB or RGBA PNG into RGBA pixels (inflate plus the five row filters),
// so the evaluation can run the palette code on a real picture without a canvas. Not shipped.
import { inflateSync } from "node:zlib";
import type { PixelImage } from "../../../src/vision/palette";

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const be32 = (b: Uint8Array, at: number): number => ((b[at] ?? 0) * 0x1000000) + (((b[at + 1] ?? 0) << 16) | ((b[at + 2] ?? 0) << 8) | (b[at + 3] ?? 0));
const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

export function decodePng(bytes: Uint8Array): PixelImage {
  if (!SIGNATURE.every((v, i) => bytes[i] === v)) throw new Error("not a PNG");
  let width = 0;
  let height = 0;
  let channels = 0;
  const parts: Uint8Array[] = [];
  for (let at = 8; at + 8 <= bytes.length; ) {
    const length = be32(bytes, at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = be32(body, 0);
      height = be32(body, 4);
      const [depth, colour, , , interlace] = [body[8], body[9], body[10], body[11], body[12]];
      if (depth !== 8 || interlace !== 0 || (colour !== 2 && colour !== 6)) throw new Error(`unsupported PNG (depth ${depth}, colour ${colour}, interlace ${interlace})`);
      channels = colour === 2 ? 3 : 4;
    } else if (type === "IDAT") parts.push(body);
    else if (type === "IEND") break;
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const out = new Uint8ClampedArray(width * height * 4);
  const rows: Uint8Array[] = [];
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)] ?? 0;
    const line = new Uint8Array(stride);
    const prior = rows[y - 1] ?? new Uint8Array(stride);
    for (let x = 0; x < stride; x += 1) {
      const value = raw[y * (stride + 1) + 1 + x] ?? 0;
      const left = x >= channels ? (line[x - channels] ?? 0) : 0;
      const up = prior[x] ?? 0;
      const upLeft = x >= channels ? (prior[x - channels] ?? 0) : 0;
      const base = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : paeth(left, up, upLeft);
      line[x] = (value + base) & 0xff;
    }
    rows.push(line);
    for (let x = 0; x < width; x += 1) out.set([line[x * channels] ?? 0, line[x * channels + 1] ?? 0, line[x * channels + 2] ?? 0, channels === 4 ? (line[x * channels + 3] ?? 255) : 255], (y * width + x) * 4);
  }
  return { data: out, width, height };
}
