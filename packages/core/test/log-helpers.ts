// Test support for log-*.test.ts and verify-*.test.ts: a SIMULATED demo log (DM1-DM4 plus an answered
// escalation, a revoke and expiry) built with the real appendEntry and deterministic test keys.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createSigner } from "../src/crypto";
import type { CardRecord, Decision, LogEntry, LogEntryKind, LogPayloadByKind } from "../src/generated";
import { appendEntry, signEscalationAnswer, signRevocation } from "../src/log";
import type { Checkpoint, Signer } from "../src/ports";
import { FakeClock, MemoryLogStore } from "../src/testing";
import { loadFixture } from "../src/testing/fixtures";
import { signMandateCredential, type UnsignedMandateCredential } from "../src/vc";
import { testSeed } from "./crypto-independent";

export const LOG_ID = "log_demoM0";
export const MANDATE_ID = "mnd_demoM0";
export const ENGINE_SEED = testSeed("engine");
export const DELEGATOR_SEED = testSeed("delegator");
export const AGENT_SEED = testSeed("agent");

const SCHEMA_DIR = fileURLToPath(new URL("../../../schemas/", import.meta.url));

function schemaExample<T>(file: string): T {
  const json = JSON.parse(readFileSync(`${SCHEMA_DIR}${file}`, "utf8")) as { examples: T[] };
  return structuredClone(json.examples[0] as T);
}

export interface DemoKeys {
  readonly engine: Signer;
  readonly delegator: Signer;
  readonly agentDid: string;
  readonly publicKeys: { readonly engine: readonly string[]; readonly delegator: string };
}

export function demoKeys(): DemoKeys {
  const engine = createSigner(ENGINE_SEED);
  const delegator = createSigner(DELEGATOR_SEED);
  const agentDid = createSigner(AGENT_SEED).did;
  return { engine, delegator, agentDid, publicKeys: { engine: [engine.did], delegator: delegator.did } };
}

export function demoCredential(keys: DemoKeys = demoKeys(), mandateId = MANDATE_ID) {
  const { proof: _proof, ...fixture } = loadFixture("mandate/m0.credential.json", "mandate-credential");
  const unsigned: UnsignedMandateCredential = {
    ...fixture,
    id: `urn:laisee:mandate:${mandateId}`,
    issuer: keys.delegator.did,
    credentialSubject: { ...fixture.credentialSubject, id: keys.agentDid },
  };
  return signMandateCredential(unsigned, keys.delegator, { created: new Date("2026-10-03T02:00:00Z") });
}

function approveDecision(): Decision {
  const base = schemaExample<Decision>("decision.schema.json");
  const { explanation: _explanation, ...rest } = base;
  const cart = loadFixture("carts/attempt-1.json", "cart");
  const rules = rest.rules.map((r) => {
    if (r.id !== "R3") return r;
    const { verdict: _verdict, template_id: _template, ...passing } = r;
    return { ...passing, result: "PASS" as const };
  }) as Decision["rules"];
  return { ...rest, id: "dec_demoA1", cart, rules, outcome: "APPROVE", approved_limit_minor: cart.total_minor };
}

function escalateDecision(): Decision {
  const base = schemaExample<Decision>("decision.schema.json");
  return {
    ...base,
    id: "dec_demoE1",
    outcome: "ESCALATE",
    escalation: { state: "OPEN", expires_at: "2026-10-03T02:21:00Z" },
  };
}

function answeredDecision(answer: NonNullable<NonNullable<Decision["escalation"]>["answer"]>): Decision {
  const base = schemaExample<Decision>("decision.schema.json");
  return {
    ...base,
    id: "dec_demoE2",
    resolves: "dec_demoE1",
    outcome: "DENY",
    escalation: { state: "DENIED", expires_at: "2026-10-03T02:21:00Z", answer },
  };
}

export type DemoStep = { readonly [K in LogEntryKind]: { readonly kind: K; readonly payload: LogPayloadByKind[K] } }[LogEntryKind];

/** The SIMULATED storyline as (kind, payload) steps, seq 0..9. */
export function demoSteps(keys: DemoKeys = demoKeys()): DemoStep[] {
  const card = schemaExample<CardRecord>("card-record.schema.json");
  const answer = signEscalationAnswer(
    { decision_id: "dec_demoE1", choice: "DENY", answered_at: new Date("2026-10-03T02:20:30Z") },
    keys.delegator,
  );
  const revocation = signRevocation(
    { mandate_id: MANDATE_ID, revoked_at: new Date("2026-10-03T02:30:00Z"), reason: "Demo revoke (SIMULATED)." },
    keys.delegator,
  );
  const event = { card_id: card.id, at: "2026-10-03T02:06:00Z", simulated: true as const };
  return [
    { kind: "MANDATE_SEALED", payload: demoCredential(keys) },
    { kind: "DECISION", payload: approveDecision() },
    { kind: "CARD_MINTED", payload: card },
    {
      kind: "CARD_EVENT",
      payload: { ...event, event: "DECLINED", amount_minor: 25901, merchant_domain: "demo-apparel.example", decline_code: "OVER_LIMIT" },
    },
    {
      kind: "CARD_EVENT",
      payload: { ...event, event: "AUTHORISED", amount_minor: 25900, merchant_domain: "demo-apparel.example", idempotency_key: "chk_demoA1" },
    },
    { kind: "DECISION", payload: schemaExample<Decision>("decision.schema.json") },
    { kind: "DECISION", payload: escalateDecision() },
    { kind: "DECISION", payload: answeredDecision(answer) },
    { kind: "MANDATE_REVOKED", payload: revocation },
    { kind: "PACKET_EXPIRED", payload: { mandate_id: MANDATE_ID, expired_at: "2026-10-31T15:59:59Z" } },
  ];
}

export interface DemoLog {
  readonly keys: DemoKeys;
  readonly entries: readonly LogEntry[];
  readonly checkpoint: Checkpoint;
  readonly store: MemoryLogStore;
}

/** Appends the steps through the real appendEntry, one simulated second apart. */
export async function buildLog(steps: readonly DemoStep[], keys: DemoKeys = demoKeys(), logId = LOG_ID): Promise<DemoLog> {
  const store = new MemoryLogStore();
  const clock = new FakeClock("2026-10-03T02:00:01Z");
  for (const step of steps) {
    await appendEntry(store, keys.engine, logId, step.kind, step.payload, clock.now());
    clock.advance(1000);
  }
  const entries = await store.read(logId);
  const last = entries.at(-1);
  if (!last) throw new Error("empty demo log");
  return { keys, entries, store, checkpoint: { log_id: last.log_id, seq: last.seq, entry_hash: last.entry_hash } };
}

export async function buildDemoLog(): Promise<DemoLog> {
  const keys = demoKeys();
  return buildLog(demoSteps(keys), keys);
}

/** Deep copy of entries as plain JSON values (what a verifier parses from a file). */
export function asJson(entries: readonly LogEntry[]): Record<string, unknown>[] {
  return entries.map((e) => JSON.parse(JSON.stringify(e)) as Record<string, unknown>);
}
