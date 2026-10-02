// cart.scameter from the injected capture lookup (R9 input). No ref or no capture => NOT_CHECKED, which R9 treats
// as unverified ("no record" is not "safe" [F6]). A broken capture or one about another merchant fails closed.
import type { Cart, ListingRecord } from "../generated";
import { formatIssues, validateScameterCapture } from "../schema";
import { reject, type Step } from "./proposal";
import type { ScameterLookup } from "./types";

const NOT_CHECKED: Cart["scameter"] = { state: "NOT_CHECKED", capture_ref: null, captured_at: null, searched: [] };

function lookup(scameterByRef: ScameterLookup, ref: string): Step<unknown> {
  try {
    return { ok: true, value: scameterByRef(ref) };
  } catch {
    return reject("scameter_invalid", "the Scameter capture lookup failed");
  }
}

export function scameterOf(record: ListingRecord, scameterByRef: ScameterLookup): Step<Cart["scameter"]> {
  const ref = record.scameter_ref;
  if (ref === null) return { ok: true, value: { ...NOT_CHECKED, searched: [] } };
  const found = lookup(scameterByRef, ref);
  if (!found.ok) return found;
  if (found.value === null || found.value === undefined) return { ok: true, value: { ...NOT_CHECKED, searched: [] } };
  const checked = validateScameterCapture(found.value);
  if (!checked.ok) return reject("scameter_invalid", `Scameter capture fails its schema: ${formatIssues(checked.errors)}`);
  const capture = checked.value;
  if (capture.capture_ref !== ref) return reject("scameter_mismatch", "the lookup returned a capture with another capture_ref");
  if (capture.subject_domain !== record.merchant.domain) return reject("scameter_mismatch", "the Scameter capture is about another merchant domain");
  return { ok: true, value: { state: capture.state, capture_ref: capture.capture_ref, captured_at: capture.captured_at, searched: [...capture.searched] } };
}
