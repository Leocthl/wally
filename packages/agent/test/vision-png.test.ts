// The test-support PNG decoder, checked against PNGs built here with each of the five row filters.
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodePng } from "./support/vision/png";

const be32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const chunk = (type: string, data: number[]): number[] => [...be32(data.length), ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];

function png(width: number, height: number, colour: 2 | 6, filtered: number[][]): Uint8Array {
  const raw = Uint8Array.from(filtered.flat());
  return Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, ...chunk("IHDR", [...be32(width), ...be32(height), 8, colour, 0, 0, 0]), ...chunk("IDAT", [...deflateSync(raw)]), ...chunk("IEND", [])]);
}

describe("decodePng", () => {
  it("decodes RGB rows written with filters none, sub, up, average and paeth", () => {
    // Three pixels per row. Wanted pixels: row0 (10,20,30) (40,50,60) (70,80,90); row1 (11,21,31) (41,51,61) (71,81,91); ...
    const want = [
      [10, 20, 30, 40, 50, 60, 70, 80, 90],
      [11, 21, 31, 41, 51, 61, 71, 81, 91],
      [12, 22, 32, 42, 52, 62, 72, 82, 92],
      [13, 23, 33, 43, 53, 63, 73, 83, 93],
      [14, 24, 34, 44, 54, 64, 74, 84, 94],
    ];
    const rows: number[][] = [];
    want.forEach((row, y) => {
      const prior = want[y - 1] ?? row.map(() => 0);
      const filter = y; // 0 none, 1 sub, 2 up, 3 average, 4 paeth
      const encoded = row.map((value, x) => {
        const left = x >= 3 ? (row[x - 3] ?? 0) : 0;
        const up = y === 0 ? 0 : (prior[x] ?? 0);
        const upLeft = x >= 3 && y > 0 ? (prior[x - 3] ?? 0) : 0;
        const base = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : (() => {
          const p = left + up - upLeft;
          const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
          return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        })();
        return (value - base + 256) & 0xff;
      });
      rows.push([filter, ...encoded]);
    });
    const out = decodePng(png(3, 5, 2, rows));
    expect([out.width, out.height]).toEqual([3, 5]);
    want.forEach((row, y) => {
      for (let x = 0; x < 3; x += 1) expect(Array.from(out.data).slice((y * 3 + x) * 4, (y * 3 + x) * 4 + 4)).toEqual([row[x * 3], row[x * 3 + 1], row[x * 3 + 2], 255]);
    });
  });

  it("keeps the alpha channel of an RGBA picture", () => {
    const out = decodePng(png(2, 1, 6, [[0, 1, 2, 3, 4, 5, 6, 7, 8]]));
    expect(Array.from(out.data)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("refuses what it does not decode", () => {
    expect(() => decodePng(Uint8Array.from([1, 2, 3]))).toThrow(/not a PNG/);
  });
});
