// The "colour plates": the dominant colours of a picture, named with the 17 colour words, from its pixels alone. No
// model and no randomness, so it works offline, on the on-device build and in the native shells, and gives the same
// answer for the same pixels. Steps: sample the pixels on a small grid, weight the middle of the picture up and a plain
// backdrop down, cluster in CIELAB with a fixed seeding, and name each cluster by its nearest colour anchor.
import { deltaE, nearestColor, rgbToLab, type Lab } from "./color";
import type { Color } from "./vocab";

export interface PaletteEntry {
  readonly color: Color;
  /** Share of the weighted pixels, 0 to 1, three decimals. */
  readonly share: number;
}

/** RGBA bytes as a canvas ImageData has them (row by row, 4 values per pixel). */
export interface PixelImage {
  readonly data: ArrayLike<number>;
  readonly width: number;
  readonly height: number;
}

/** Working grid: at most about this many samples per side. */
const GRID = 48;
const CLUSTERS = 6;
const ITERATIONS = 12;
const MAX_ENTRIES = 4;
const MIN_SHARE = 0.05;
/** The outer ring (this fraction of each side) is read as the backdrop. */
const RING = 0.06;
/** Pixels this close (Lab distance) to the backdrop colour are discounted. */
const BACKDROP_DELTA_E = 12;
const BACKDROP_WEIGHT = 0.1;
/** The edge ring counts as a backdrop only if at least this share of it is one colour (a studio sweep, not a busy street). */
const RING_UNIFORM = 0.6;
/** The middle box (this fraction of each side) must hold a subject that differs from the backdrop, else nothing is discounted. */
const MIDDLE = 0.4;
const MIDDLE_SUBJECT_SHARE = 0.35;
const CENTRE_FLOOR = 0.3;
const CENTRE_SIGMA = 0.55;
const ALPHA_MIN = 128;

interface Sample {
  readonly lab: Lab;
  /** 0 to 1 across and down the picture. */
  readonly x: number;
  readonly y: number;
  readonly weight: number;
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const median = (values: readonly number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

function samplePixels(image: PixelImage): readonly Sample[] {
  const { data, width, height } = image;
  const step = Math.max(1, Math.floor(Math.max(width, height) / GRID));
  const samples: Sample[] = [];
  for (let py = Math.floor(step / 2); py < height; py += step) {
    for (let px = Math.floor(step / 2); px < width; px += step) {
      const at = (py * width + px) * 4;
      if ((data[at + 3] ?? 255) < ALPHA_MIN) continue;
      const x = (px + 0.5) / width;
      const y = (py + 0.5) / height;
      const centre = Math.exp(-(((x - 0.5) / CENTRE_SIGMA) ** 2 + ((y - 0.5) / CENTRE_SIGMA) ** 2) / 2);
      samples.push({ lab: rgbToLab([data[at] ?? 0, data[at + 1] ?? 0, data[at + 2] ?? 0]), x, y, weight: CENTRE_FLOOR + (1 - CENTRE_FLOOR) * centre });
    }
  }
  return samples;
}

const onRing = (s: Sample): boolean => s.x < RING || s.x > 1 - RING || s.y < RING || s.y > 1 - RING;
const inMiddle = (s: Sample): boolean => Math.abs(s.x - 0.5) <= MIDDLE / 2 && Math.abs(s.y - 0.5) <= MIDDLE / 2;

/** Turns a plain studio backdrop down: only when the edge is mostly one colour and the middle holds something else. */
function discountBackdrop(samples: readonly Sample[]): readonly Sample[] {
  const ring = samples.filter(onRing);
  const middle = samples.filter(inMiddle);
  if (ring.length < 8 || middle.length < 4) return samples;
  const backdrop: Lab = [median(ring.map((s) => s.lab[0])), median(ring.map((s) => s.lab[1])), median(ring.map((s) => s.lab[2]))];
  const isBackdrop = (s: Sample): boolean => deltaE(s.lab, backdrop) <= BACKDROP_DELTA_E;
  if (ring.filter(isBackdrop).length / ring.length < RING_UNIFORM) return samples;
  const subject = middle.filter((s) => !isBackdrop(s)).length / middle.length;
  if (subject < MIDDLE_SUBJECT_SHARE) return samples;
  return samples.map((s) => (isBackdrop(s) ? { ...s, weight: s.weight * BACKDROP_WEIGHT } : s));
}

/** Farthest-point seeding (heaviest sample first, then the sample farthest from every centre so far), then weighted k-means. */
function cluster(samples: readonly Sample[], k: number): readonly { readonly centre: Lab; readonly weight: number }[] {
  const first = samples.reduce((best, s) => (s.weight > best.weight ? s : best), samples[0] as Sample);
  let centres: Lab[] = [first.lab];
  while (centres.length < Math.min(k, samples.length)) {
    const taken = centres;
    const next = samples.reduce(
      (best, s) => {
        const score = Math.min(...taken.map((c) => deltaE(s.lab, c))) * s.weight;
        return score > best.score ? { score, lab: s.lab } : best;
      },
      { score: -1, lab: first.lab },
    );
    if (next.score <= 0) break;
    centres = [...centres, next.lab];
  }
  let assignment: number[] = [];
  for (let round = 0; round < ITERATIONS; round += 1) {
    const current = centres;
    assignment = samples.map((s) => current.reduce((best, c, i) => (deltaE(s.lab, c) < deltaE(s.lab, current[best] as Lab) ? i : best), 0));
    centres = current.map((previous, i) => {
      const members = samples.filter((_, at) => assignment[at] === i);
      const total = members.reduce((sum, m) => sum + m.weight, 0);
      if (total === 0) return previous;
      const mean = (channel: 0 | 1 | 2): number => members.reduce((sum, m) => sum + m.lab[channel] * m.weight, 0) / total;
      return [mean(0), mean(1), mean(2)] as const;
    });
  }
  return centres.map((centre, i) => ({ centre, weight: samples.reduce((sum, s, at) => (assignment[at] === i ? sum + s.weight : sum), 0) }));
}

/** The picture's dominant colours as colour words, biggest share first (at most four, none under 5 percent). Empty when there are no usable pixels. */
export function extractPalette(image: PixelImage): readonly PaletteEntry[] {
  if (!(image.width > 0 && image.height > 0) || image.data.length < image.width * image.height * 4) return [];
  const samples = discountBackdrop(samplePixels(image));
  const total = samples.reduce((sum, s) => sum + s.weight, 0);
  if (samples.length === 0 || total <= 0) return [];
  const byColor = new Map<Color, number>();
  for (const { centre, weight } of cluster(samples, CLUSTERS)) {
    const { color } = nearestColor(centre);
    byColor.set(color, (byColor.get(color) ?? 0) + weight / total);
  }
  return [...byColor.entries()]
    .filter(([, share]) => share >= MIN_SHARE)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ENTRIES)
    .map(([color, share]) => ({ color, share: round3(share) }));
}
