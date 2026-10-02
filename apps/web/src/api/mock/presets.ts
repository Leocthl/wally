// The booth preset: mandate M0 (docs/01 Example mandates), sealed on load. Rules come from the SIMULATED credential fixture [F20].
import type { SealRequest } from "../types";
import { M0_CREDENTIAL } from "./fixtures";
import { addMs } from "../../domain/time";

/** HKT = UTC+8, no daylight saving. */
const HKT_OFFSET_MS = 8 * 60 * 60 * 1000;
const ONE_SECOND_MS = 1000;

/** The M0 sentence from docs/01, as the delegator would type it. */
export const M0_SENTENCE = "HK$800 this month for clothes, verified sellers only";

/** Last second of the current month in Hong Kong, as RFC 3339 UTC (R2 expiry = month end). */
export function endOfMonthHkt(now: Date): string {
  const hk = new Date(now.getTime() + HKT_OFFSET_MS);
  const nextMonthStartHk = Date.UTC(hk.getUTCFullYear(), hk.getUTCMonth() + 1, 1);
  return new Date(nextMonthStartHk - HKT_OFFSET_MS - ONE_SECOND_MS).toISOString().replace(".000Z", "Z");
}

export function m0SealRequest(now: Date): SealRequest {
  return { intentText: M0_SENTENCE, rules: M0_CREDENTIAL.credentialSubject.rules, validUntil: endOfMonthHkt(now) };
}

export { addMs };
