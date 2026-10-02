// Audit (lane s-audit): what the offline verifier proves about I1/I2 when the operator holds the engine
// key (docs/02 section 4: the verifier must not trust the operator; step 9 "re-fold and report" is a stretch).
// verifyChain checks signatures, hashes, bindings and delegator material, but not that a CARD_MINTED entry
// follows a logged APPROVE for the same decision with limit == approved total, once per decision.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CardRecord, Decision } from "../src/generated";
import { verifyChain } from "../src/verify";
import { buildLog, demoCredential, demoKeys, type DemoStep } from "./log-helpers";

const SCHEMA_DIR = fileURLToPath(new URL("../../../schemas/", import.meta.url));
const example = <T>(file: string): T => structuredClone((JSON.parse(readFileSync(`${SCHEMA_DIR}${file}`, "utf8")) as { examples: T[] }).examples[0]!);

const keys = demoKeys();
const DECISION = example<Decision>("decision.schema.json");
const CARD = example<CardRecord>("card-record.schema.json");

async function verified(steps: DemoStep[]) {
  const log = await buildLog([{ kind: "MANDATE_SEALED", payload: demoCredential(keys) }, ...steps], keys);
  return verifyChain(log.entries, keys.publicKeys);
}

// The engine key signs whatever the operator appends; these logs are what a buggy or hostile orchestrator writes.
const NO_APPROVE = await verified([{ kind: "CARD_MINTED", payload: { ...CARD, decision_id: "dec_neverDecided1", limit_minor: 200000 } }]);
const AFTER_DENY = await verified([
  { kind: "DECISION", payload: DECISION }, // the schema example is a DENY
  { kind: "CARD_MINTED", payload: { ...CARD, decision_id: DECISION.id } },
]);
const TWICE = await verified([
  { kind: "CARD_MINTED", payload: CARD },
  { kind: "CARD_MINTED", payload: { ...CARD, id: "crd_secondCard01" } },
]);

describe("setup", () => {
  it("the schema example decision is a DENY and the hostile logs were signed by the engine key", () => {
    expect(DECISION.outcome).toBe("DENY");
    for (const r of [NO_APPROVE, AFTER_DENY, TWICE]) expect(r).toHaveProperty("ok");
  });
});

describe("KNOWN DEFECT S-VER-1: offline verification does not check I1/I2 for CARD_MINTED", () => {
  it.fails("rejects a CARD_MINTED whose decision_id is not a logged APPROVE (I1)", () => {
    expect(NO_APPROVE.ok).toBe(false);
  });

  it.fails("rejects a CARD_MINTED that follows a DENY for the same decision (I1)", () => {
    expect(AFTER_DENY.ok).toBe(false);
  });

  it.fails("rejects two cards minted for one decision", () => {
    expect(TWICE.ok).toBe(false);
  });
});
