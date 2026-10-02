// Scans serialized payloads for card data (I8) the way the core log guard does: a 13-19 digit run that stands alone
// (not inside a hex, base64 or did:key token, not the fraction of a decimal) and passes the Luhn check, or a CVV word.
import { luhnValid } from "@laisee/core/log";

const PAN_RUN = /(?<![A-Za-z0-9.])\d(?:[ -]?\d){12,18}(?![A-Za-z0-9])/g;
const CVV_WORD = /\b(cvv2?|cvc2?)\b/i;

export function panLikeIn(text: string): string | null {
  for (const match of text.matchAll(PAN_RUN)) {
    const digits = match[0].replace(/[ -]/g, "");
    if (luhnValid(digits)) return match[0];
  }
  return CVV_WORD.exec(text)?.[0] ?? null;
}
