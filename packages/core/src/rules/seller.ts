// R9 seller check from the manual Scameter capture [F6] and its age [F52]. FLAGGED always DENY.
// With require_capture, a missing, unknown, future-dated or stale capture is unverified => ESCALATE.
// NO_RECORD with a fresh capture passes R9 but is not "safe": R10 seller_risk still applies.
import { THRESHOLD_REFS, type EngineConfig } from "../config";
import type { Cart, Mandate } from "../generated";
import { MS_PER_S, failed, parseTime, passed, timeOf, type RuleResult } from "./result";

export interface R9Input {
  readonly mandate: Mandate;
  readonly cart: Cart;
  readonly now: Date;
  readonly config: EngineConfig;
}

type Freshness = "fresh" | "stale" | "missing";

function freshness(capturedMs: number | null, nowMs: number | null, maxAgeS: number): Freshness {
  if (capturedMs === null || nowMs === null || capturedMs > nowMs) return "missing";
  return nowMs - capturedMs > maxAgeS * MS_PER_S ? "stale" : "fresh";
}

/** R9: DENY R9.flagged; ESCALATE R9.unverified when a required capture is missing or stale. */
export function evaluateR9({ mandate, cart, now, config }: R9Input): RuleResult {
  const check = mandate.rules.seller_check;
  const sc = cart.scameter;
  const maxAgeS = check.max_capture_age_s ?? config.seller.max_capture_age_s;
  const thresholdRef = check.max_capture_age_s === undefined ? THRESHOLD_REFS.capture_age : "mandate.rules.seller_check.max_capture_age_s";
  const nowMs = timeOf(now);
  const capturedMs = parseTime(sc.captured_at);
  const ageS = capturedMs === null || nowMs === null ? null : Math.ceil((nowMs - capturedMs) / MS_PER_S);
  const fresh = freshness(capturedMs, nowMs, maxAgeS);
  const state: unknown = sc.state;
  const inputs = {
    state,
    capture_ref: sc.capture_ref,
    captured_at: sc.captured_at,
    capture_age_s: ageS,
    max_capture_age_s: maxAgeS,
    require_capture: check.require_capture,
  };
  if (state === "FLAGGED") return failed({ id: "R9", inputs, comparator: "!=" }, "DENY", "R9.flagged");
  const spec = { id: "R9" as const, comparator: "<=" as const, thresholdRef };
  if (state !== "NO_RECORD" && state !== "NOT_CHECKED") {
    return failed({ ...spec, inputs: { ...inputs, stale: false } }, "ESCALATE", "R9.unverified");
  }
  if (check.require_capture !== true) return passed({ ...spec, inputs });
  if (state === "NOT_CHECKED" || fresh !== "fresh") {
    return failed({ ...spec, inputs: { ...inputs, stale: fresh === "stale" } }, "ESCALATE", "R9.unverified");
  }
  return passed({ ...spec, inputs });
}
