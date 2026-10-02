// Family budgets in the booth: Mum funds a ceiling and Mei (the shopper) gives Wally a share of it (parent -> child ->
// Wally). Mum is a SIMULATED demo parent: this backend holds her throwaway key, made per session and never saved, and
// signs her credential the way it holds and signs for Mei's delegator key (DEMO SHORTCUT, keys.ts). Caps compose: the
// orchestrator seals Mei's budget only when it is inside Mum's rules (core/family). Mum's credential is checked at seal
// time and is not in Mei's log, so the offline verifier page checks Mei's budget only and cannot check this chain; the
// credential is exported next to the log (parent-credential.json) for inspection.
import { createAllocationLedger, hkd, summarizeParent, type AllocationLedger } from "@laisee/core/family";
import type { CompiledRules, MandateCredential } from "@laisee/core/generated";
import { credentialIdForMandate, mandateFromCredential, signMandateCredential, type UnsignedMandateCredential } from "@laisee/core/vc";
import type { FamilySummary, SealRequest } from "../../api/types";
import type { BoothError } from "./errors";
import { ephemeralSigner } from "./keys";
import { seconds, VC_CONTEXT, type SessionDeps } from "./session";
import type { Step } from "./step";

/** The only demo parent. */
export const FAMILY_PARENT = "mum" as const;
/** SIMULATED demo preset (ASSUMED, no register row; M0's HK$800 is [F20]): what Mum allows one budget to take, in minor units. */
export const FAMILY_CEILING_MINOR = 100_000;
/** What Mum allows Wally to buy. */
export const FAMILY_CATEGORIES: CompiledRules["categories"] = ["apparel"];

/**
 * Mum's ceiling for the current demo keys: her signed credential and what she has given out. Her key signs the credential
 * once, when it is made, and is then dropped; only her did:key stays (the pinned parent key of the orchestrator).
 */
export interface FamilyKit {
  /** Mum's did:key (the credential's issuer). */
  readonly parentDid: string;
  readonly credential: MandateCredential;
  /** The credential's mandate id (the key of the ledger). */
  readonly parentId: string;
  readonly ledger: AllocationLedger;
}

const INTENT = `Mum allows up to ${hkd(FAMILY_CEILING_MINOR)} for clothes, verified sellers only.`;

/** Mum seals her ceiling for Mei's delegator key, until `validUntil` (the preset budget's end). */
export function createFamilyKit(deps: Pick<SessionDeps, "clock" | "newId" | "delegator">, validUntil: string): FamilyKit {
  const signer = ephemeralSigner();
  const now = deps.clock.now();
  const mandateId = deps.newId("mnd");
  const unsigned: UnsignedMandateCredential = {
    "@context": VC_CONTEXT,
    type: ["VerifiableCredential", "AgentDelegationCredential"],
    id: credentialIdForMandate(mandateId),
    issuer: signer.did,
    validFrom: seconds(now),
    validUntil,
    credentialSubject: {
      id: deps.delegator.did,
      intent_text: INTENT,
      rules: {
        budget: { amount_minor: FAMILY_CEILING_MINOR, currency: "HKD" },
        categories: [...FAMILY_CATEGORIES] as CompiledRules["categories"],
        merchants: { allow: null, deny: [] },
        seller_check: { require_capture: true },
      },
    },
  };
  const credential = signMandateCredential(unsigned, signer, { created: now });
  return { parentDid: signer.did, credential, parentId: mandateFromCredential(credential).id, ledger: createAllocationLedger() };
}

/** GET /api/family. */
export function familySummary(kit: FamilyKit): FamilySummary {
  return { parent: FAMILY_PARENT, ...summarizeParent(mandateFromCredential(kit.credential), kit.ledger.allocated(kit.parentId)) };
}

/** A family scenario's seal request: the preset budget with another amount, as Mei's share of Mum's. */
export function familySealRequest(preset: SealRequest, sealMinor: number): SealRequest {
  return { ...preset, rules: { ...preset.rules, budget: { amount_minor: sealMinor, currency: "HKD" } }, family: { parent: FAMILY_PARENT } };
}

/** How a refused seal ends a family scenario's run: a DENY for Mum's refusal (EXCEEDS_PARENT), an ERROR for anything else. */
export function refusedStep(err: BoothError): Step {
  return { outcome: err.code === "EXCEEDS_PARENT" ? "DENY" : "ERROR", code: err.code, note: err.message };
}

/** Said beside the exported parent credential. */
export const PARENT_EXPORT_NOTE =
  "Mum's credential is checked when a budget is sealed and is not part of the log. The offline verifier page checks the budget and the log only and cannot check this link; open parent-credential.json to inspect Mum's rules.";
