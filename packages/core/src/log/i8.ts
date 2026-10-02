// I8 guard: the log never takes card data. Schemas already forbid PAN/CVV fields where they are strict;
// this also covers free-text fields (revoke reason, explanation inputs, titles). It flags Luhn-valid
// 13-19 digit runs that stand alone (not inside a hex or base64 token), card-data keys and CVV mentions.
// Findings name the path, never the digits.

const PAN_RUN = /(?<![A-Za-z0-9])\d(?:[ -]?\d){12,18}(?![A-Za-z0-9])/g;
const CARD_KEY = /^(pan|primary_?account_?number|card_?number|cvv2?|cvc2?|security_?code)$/i;
const CVV_WORD = /\b(cvv2?|cvc2?)\b/i;
/** ISO/IEC 7812 card numbers are 13-19 digits. */
const PAN_MIN_DIGITS = 13;
const PAN_MAX_DIGITS = 19;

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

function panLike(text: string): boolean {
  for (const match of text.matchAll(PAN_RUN)) {
    const digits = match[0].replace(/[ -]/g, "");
    if (digits.length >= PAN_MIN_DIGITS && digits.length <= PAN_MAX_DIGITS && luhnValid(digits)) return true;
  }
  return false;
}

function checkScalar(value: unknown, path: string): string | null {
  if (typeof value === "string") {
    if (panLike(value)) return `PAN-like digit run at ${path}`;
    if (CVV_WORD.test(value)) return `CVV mention at ${path}`;
  }
  if (typeof value === "number" && Number.isInteger(value) && panLike(String(Math.abs(value)))) {
    return `PAN-like number at ${path}`;
  }
  return null;
}

/** First card-data finding in a JSON value, or null. */
export function findCardData(value: unknown, path = "$"): string | null {
  if (value === null || typeof value !== "object") return checkScalar(value, path);
  if (Array.isArray(value)) {
    for (const [i, item] of value.entries()) {
      const found = findCardData(item, `${path}[${i}]`);
      if (found) return found;
    }
    return null;
  }
  for (const [key, item] of Object.entries(value)) {
    if (CARD_KEY.test(key)) return `card data field ${path}.${key}`;
    const found = findCardData(item, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}
