// Pictures for the photo specs, made here from flat colours (no photo of a real product is in the repository).
import { crc32, deflateSync } from "node:zlib";

/** A PNG from a function of (x, y): 8-bit RGB, no filter. */
export function png(width: number, height: number, at: (x: number, y: number) => readonly [number, number, number]): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) rows.set(at(x, y), y * (width * 3 + 1) + 1 + x * 3);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

/** A navy garment on a plain studio backdrop. */
export const NAVY_PICTURE = png(600, 800, (x, y) => (x > 140 && x < 460 && y > 150 && y < 650 ? [31, 47, 85] : [246, 246, 244]));
