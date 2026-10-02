// Linear scan for card-number-shaped digit runs (I8 guard), over text already normalised to ASCII digits.
// A run is digit groups joined by one to three separator characters ([\s./_-], Unicode dashes, middle dot).
// Every span of whole groups that holds 13-19 digits [ISO/IEC 7812], stands alone (no ASCII letter or digit
// right before or after it) and passes Luhn counts as a PAN. Checking every span, not only the longest one,
// keeps a date or reference in front of a PAN from hiding it. No regex backtracking: time is linear in the text.

/** ISO/IEC 7812 card numbers are 13-19 digits. */
export const PAN_MIN_DIGITS = 13;
export const PAN_MAX_DIGITS = 19;
/** Most separator characters allowed between two digit groups of one run. */
const MAX_SEPARATORS = 3;
const SEPARATOR = /[\s./_\-‐-―−·]/;
const ASCII_ALNUM = /[A-Za-z0-9]/;
const DIGIT_0 = 48;
const DIGIT_9 = 57;

interface Group {
  readonly start: number;
  readonly end: number;
}

const isDigitAt = (text: string, i: number): boolean => text.charCodeAt(i) >= DIGIT_0 && text.charCodeAt(i) <= DIGIT_9;

function joinedBySeparators(text: string, from: number, to: number): boolean {
  if (to - from < 1 || to - from > MAX_SEPARATORS) return false;
  for (let k = from; k < to; k += 1) if (!SEPARATOR.test(text.charAt(k))) return false;
  return true;
}

/** Digit groups of every run in the text, in order. */
function runsOf(text: string): readonly (readonly Group[])[] {
  const runs: Group[][] = []; // local builder: nothing outside this call sees it mutate
  let i = 0;
  while (i < text.length) {
    if (!isDigitAt(text, i)) {
      i += 1;
      continue;
    }
    const start = i;
    while (i < text.length && isDigitAt(text, i)) i += 1;
    const run = runs.at(-1);
    const last = run?.at(-1);
    if (run !== undefined && last !== undefined && joinedBySeparators(text, last.end, start)) run.push({ start, end: i });
    else runs.push([{ start, end: i }]);
  }
  return runs;
}

const standsAlone = (text: string, start: number, end: number): boolean =>
  !ASCII_ALNUM.test(text.charAt(start - 1)) && !ASCII_ALNUM.test(text.charAt(end));

/** Luhn (mod 10) check over a digit string. */
export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
}

/** Spans of whole groups starting at `from`, up to 19 digits: at most 19 groups, so the scan stays linear. */
function spanHasPan(text: string, run: readonly Group[], from: number): boolean {
  const first = run[from];
  let digits = "";
  for (let j = from; first !== undefined && j < run.length; j += 1) {
    const group = run[j] as Group;
    digits += text.slice(group.start, group.end);
    if (digits.length > PAN_MAX_DIGITS) return false;
    if (digits.length >= PAN_MIN_DIGITS && standsAlone(text, first.start, group.end) && luhnValid(digits)) return true;
  }
  return false;
}

function runHasPan(text: string, run: readonly Group[]): boolean {
  for (let from = 0; from < run.length; from += 1) if (spanHasPan(text, run, from)) return true;
  return false;
}

/** A standalone, Luhn-valid 13-19 digit span of whole groups anywhere in the text. */
export function hasPanRun(text: string): boolean {
  return runsOf(text).some((run) => runHasPan(text, run));
}

/** Any run holding 13 or more digits, standalone or not (for opaque references that never need one). */
export function hasLongDigitRun(text: string): boolean {
  return runsOf(text).some((run) => run.reduce((sum, g) => sum + (g.end - g.start), 0) >= PAN_MIN_DIGITS);
}
