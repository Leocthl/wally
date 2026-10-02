// I8 guard: the log never takes card data. Schemas already forbid PAN/CVV fields where they are strict;
// this also covers free text and free keys (intent text, revoke reason, rule and explanation inputs).
// Text and keys are normalised first: NFKC (fullwidth digits, no-break spaces), format characters removed
// (\p{Cf}: zero-width spaces, joiners, soft hyphens) and every Unicode decimal digit read as its ASCII digit.
// Then it flags Luhn-valid 13-19 digit runs that stand alone (not inside a hex or base64 token), with up to
// 3 separators [\s./_-] between digits; card-data key names (card-number, cc_no, cvv2, security code, pan,
// card expiry); and CVV or security-code mentions. Findings name the path, never the digits.
// CARD_MINTED carries the SIMULATED rail handle by schema design: an opaque hdl_ reference, not a card number.
// The guard still scans it, and any 13+ digit run inside a handle is refused even within a token.

/** ISO/IEC 7812 card numbers are 13-19 digits. */
const PAN_MIN_DIGITS = 13;
const PAN_MAX_DIGITS = 19;
/** Separator characters allowed between two digits of one run, and how many in a row. */
const SEPARATORS = "[\\s./_-]";
const MAX_SEPARATORS = 3;
/** Longest stretch of consecutive Unicode digits scanned back to find a digit's value (Nd ranges hold 10). */
const MAX_DIGIT_SCAN = 100;

const PAN_RUN = new RegExp(`(?<![A-Za-z0-9])\\d(?:${SEPARATORS}{0,${MAX_SEPARATORS}}\\d){${PAN_MIN_DIGITS - 1},${PAN_MAX_DIGITS - 1}}(?![A-Za-z0-9])`, "g");
const LONG_DIGIT_RUN = new RegExp(`\\d(?:${SEPARATORS}{0,${MAX_SEPARATORS}}\\d){${PAN_MIN_DIGITS - 1},}`);
const SEPARATOR_CHARS = new RegExp(SEPARATORS, "g");
const FORMAT_CHARS = /\p{Cf}/gu;
const UNICODE_DIGIT = /\p{Nd}/u;
const NON_ASCII_DIGIT = /(?![0-9])\p{Nd}/gu;

const CVV_TEXT = /(?<![A-Za-z0-9])(cvv|cvc)\d*(?![A-Za-z0-9])/i;
const SECURITY_CODE_TEXT = /security[\s._-]*code|card[\s._-]*verification/i;
/** Signatures, hashes and other encodings: one long token, no spaces. Never prose, so no CVV wording check. */
const OPAQUE_TOKEN = /^[A-Za-z0-9_-]{40,}$/;
/** Key names, compared after normalising and joining their word tokens ("card-number" -> "cardnumber"). */
const CARD_KEY_JOINED =
  /^((credit|debit|payment)?(card|cc)(no|nbr|num|number|pan)|primaryaccountnumber|securitycode|cardsecuritycode|(card)?expiry(date)?|(card)?exp(date|month|year)|(card)?expiration(date|month|year))$/;
const CARD_KEY_CONTAINS = /(cardnumber|primaryaccount|securitycode|cardverification|cvv|cvc)/;
const CARD_KEY_TOKEN = /^(pan|cvv\d*|cvc\d*|cvn\d*|csc|cvd)$/;

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

/**
 * ASCII value of a non-ASCII decimal digit. Unicode encodes decimal digits in runs of ten from zero, so the value
 * is the distance from the start of the stretch of consecutive digit code points, modulo 10.
 */
function digitValue(codePoint: number): string {
  let back = 0;
  while (back < MAX_DIGIT_SCAN && UNICODE_DIGIT.test(String.fromCodePoint(codePoint - back - 1))) back += 1;
  return String(back % 10);
}

/** NFKC, no format characters, every decimal digit as ASCII: what the guard matches against. */
export function normaliseForI8(text: string): string {
  const folded = text.normalize("NFKC").replace(FORMAT_CHARS, "");
  return folded.replace(NON_ASCII_DIGIT, (d) => digitValue(d.codePointAt(0) ?? 0));
}

function panLike(text: string): boolean {
  for (const match of text.matchAll(PAN_RUN)) {
    const digits = match[0].replace(SEPARATOR_CHARS, "");
    if (digits.length >= PAN_MIN_DIGITS && digits.length <= PAN_MAX_DIGITS && luhnValid(digits)) return true;
  }
  return false;
}

function textFinding(raw: string, path: string, key: string | null): string | null {
  const text = normaliseForI8(raw);
  if (panLike(text)) return `PAN-like digit run at ${path}`;
  if (key === "handle" && LONG_DIGIT_RUN.test(text)) return `long digit run in the card handle at ${path}`;
  if (OPAQUE_TOKEN.test(text)) return null;
  if (CVV_TEXT.test(text) || SECURITY_CODE_TEXT.test(text)) return `CVV or security code mention at ${path}`;
  return null;
}

function checkScalar(value: unknown, path: string, key: string | null): string | null {
  if (typeof value === "string") return textFinding(value, path, key);
  if (typeof value === "number" && Number.isInteger(value) && panLike(String(Math.abs(value)))) {
    return `PAN-like number at ${path}`;
  }
  return null;
}

/** Word tokens of a key: "cardNumber", "card-number" and "Card Number" all give card, number. */
function keyTokens(key: string): string[] {
  const spaced = normaliseForI8(key).replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.split(/[^a-z0-9]+/).filter((t) => t !== "");
}

/** Why a key name is card data, or null. A key holding four or more digits is never echoed. */
function keyFinding(key: string, path: string): string | null {
  const tokens = keyTokens(key);
  const joined = tokens.join("");
  const shown = /\d{4}/.test(normaliseForI8(key).replace(SEPARATOR_CHARS, "")) ? "(name withheld)" : key;
  if (tokens.some((t) => CARD_KEY_TOKEN.test(t)) || CARD_KEY_JOINED.test(joined) || CARD_KEY_CONTAINS.test(joined)) {
    return `card data field ${path}.${shown}`;
  }
  return panLike(normaliseForI8(key)) ? `PAN-like digit run in a key under ${path}` : null;
}

function findInObject(value: object, path: string): string | null {
  for (const [key, item] of Object.entries(value)) {
    const byKey = keyFinding(key, path);
    if (byKey !== null) return byKey;
    const found = item !== null && typeof item === "object" ? findCardData(item, `${path}.${key}`) : checkScalar(item, `${path}.${key}`, key);
    if (found !== null) return found;
  }
  return null;
}

/** First card-data finding in a JSON value, or null. */
export function findCardData(value: unknown, path = "$"): string | null {
  if (value === null || typeof value !== "object") return checkScalar(value, path, null);
  if (Array.isArray(value)) {
    for (const [i, item] of value.entries()) {
      const found = findCardData(item, `${path}[${i}]`);
      if (found) return found;
    }
    return null;
  }
  return findInObject(value, path);
}
