// Path data helpers for the garment drawings. Shapes are written as readable absolute paths (M L H V Q C Z) and the
// compactor rewrites them into the shortest mix of absolute and relative commands, rounded to 0.1. That keeps every
// illustration well under the 3,000 byte budget without hand-minified data in the source.

/** One decimal at most, no leading zero: ".5" and "-.5" instead of "0.5" and "-0.5". */
export function n(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return String(rounded === 0 ? 0 : rounded).replace(/^(-?)0\./, "$1.");
}

type PathCommand = "M" | "L" | "H" | "V" | "Q" | "C" | "Z";

export interface PathSegment {
  readonly cmd: PathCommand;
  readonly args: readonly number[];
}

const ARITY: Readonly<Record<PathCommand, number>> = { M: 2, L: 2, H: 1, V: 1, Q: 4, C: 6, Z: 0 };
const TOKEN = /([A-Za-z])|(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)/g;

const isCommand = (value: string): value is PathCommand => value in ARITY;

/**
 * Reads absolute path data into segments, splitting implicit repeats ("L1 2 3 4" is two L segments). A command it does
 * not know, and the numbers after it, are skipped, so a bad string draws less and never throws.
 */
export function parsePath(d: string): readonly PathSegment[] {
  const groups: { cmd: PathCommand; nums: number[] }[] = [];
  let current: { cmd: PathCommand; nums: number[] } | null = null;
  for (const match of d.matchAll(TOKEN)) {
    const [, letter, number] = match;
    if (letter !== undefined) {
      current = isCommand(letter) ? { cmd: letter, nums: [] } : null;
      if (current !== null) groups.push(current);
    } else if (number !== undefined) {
      current?.nums.push(Number(number));
    }
  }
  return groups.flatMap(({ cmd, nums }): readonly PathSegment[] => {
    const size = ARITY[cmd];
    if (size === 0) return [{ cmd, args: [] }];
    const chunks = Math.floor(nums.length / size);
    return Array.from({ length: chunks }, (_, i): PathSegment => ({ cmd: cmd === "M" && i > 0 ? "L" : cmd, args: nums.slice(i * size, (i + 1) * size) }));
  });
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** The numbers of one command joined the short way: "-" doubles as the separator. */
function joinNumbers(values: readonly number[]): string {
  return values.reduce((text, value, i) => {
    const part = n(value);
    return i === 0 || part.startsWith("-") ? text + part : `${text} ${part}`;
  }, "");
}

interface Pen {
  readonly x: number;
  readonly y: number;
  readonly startX: number;
  readonly startY: number;
  readonly last: string;
  readonly text: string;
}

/** Appends one command, dropping the letter when it repeats the previous one (never for M, which would turn into L). */
function append(pen: Pen, letter: string, values: readonly number[]): { readonly last: string; readonly text: string } {
  const body = joinNumbers(values);
  const repeat = letter === pen.last && letter !== "M" && letter !== "m";
  const lead = repeat ? (body.startsWith("-") ? "" : " ") : letter;
  return { last: letter, text: pen.text + lead + body };
}

const shortest = (options: readonly { readonly text: string; readonly pen: Pen }[]): Pen =>
  options.reduce((best, option) => (option.text.length < best.text.length ? option : best)).pen;

/** Rewrites absolute path data as the shortest equivalent with absolute and relative commands mixed. */
export function compactPath(d: string): string {
  const start: Pen = { x: 0, y: 0, startX: 0, startY: 0, last: "", text: "" };
  const done = parsePath(d).reduce((pen, { cmd, args }): Pen => {
    const a = args.map(round1);
    const at = (i: number): number => a[i] ?? 0;
    const rel = (i: number): number => round1(at(i) - (i % 2 === 0 ? pen.x : pen.y));
    const move = (letter: string, values: readonly number[], x: number, y: number, extra: Partial<Pen> = {}): { readonly text: string; readonly pen: Pen } => {
      const next = append(pen, letter, values);
      return { text: next.text, pen: { ...pen, ...extra, x, y, last: next.last, text: next.text } };
    };
    switch (cmd) {
      case "M": {
        const abs = move("M", [at(0), at(1)], at(0), at(1), { startX: at(0), startY: at(1) });
        if (pen.text === "") return abs.pen;
        return shortest([abs, move("m", [rel(0), rel(1)], at(0), at(1), { startX: at(0), startY: at(1) })]);
      }
      case "L": {
        const dx = rel(0);
        const dy = rel(1);
        if (dx === 0 && dy === 0) return pen;
        return shortest([
          move("L", [at(0), at(1)], at(0), at(1)),
          move("l", [dx, dy], at(0), at(1)),
          ...(dy === 0 ? [move("H", [at(0)], at(0), pen.y), move("h", [dx], at(0), pen.y)] : []),
          ...(dx === 0 ? [move("V", [at(1)], pen.x, at(1)), move("v", [dy], pen.x, at(1))] : []),
        ]);
      }
      case "H": {
        const dx = round1(at(0) - pen.x);
        return dx === 0 ? pen : shortest([move("H", [at(0)], at(0), pen.y), move("h", [dx], at(0), pen.y)]);
      }
      case "V": {
        const dy = round1(at(0) - pen.y);
        return dy === 0 ? pen : shortest([move("V", [at(0)], pen.x, at(0)), move("v", [dy], pen.x, at(0))]);
      }
      case "Q":
        return shortest([move("Q", [at(0), at(1), at(2), at(3)], at(2), at(3)), move("q", [rel(0), rel(1), rel(2), rel(3)], at(2), at(3))]);
      case "C":
        return shortest([
          move("C", [at(0), at(1), at(2), at(3), at(4), at(5)], at(4), at(5)),
          move("c", [rel(0), rel(1), rel(2), rel(3), rel(4), rel(5)], at(4), at(5)),
        ]);
      case "Z": {
        const next = append(pen, "z", []);
        return { ...pen, x: pen.startX, y: pen.startY, last: next.last, text: next.text };
      }
    }
  }, start);
  return done.text;
}

/** The same path flipped left to right across the vertical axis x = 60 (a 120 wide drawing). Absolute data only. */
export function mirrorPath(d: string): string {
  return parsePath(d)
    .map(({ cmd, args }) => {
      if (cmd === "V" || cmd === "Z") return `${cmd}${args.join(" ")}`;
      const flipped = args.map((value, i) => (cmd === "H" || i % 2 === 0 ? 120 - value : value));
      return `${cmd}${flipped.join(" ")}`;
    })
    .join("");
}
