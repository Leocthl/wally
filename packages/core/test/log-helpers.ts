// Test support for log-*.test.ts and verify-*.test.ts: a SIMULATED demo log (DM1-DM4 plus an answered
// escalation, a revoke and expiry) built with the real appendEntry and deterministic test keys.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createSigner, toBase64url } from "../src/crypto";
import type { CardRecord, Cart, Decision, LogEntry, LogEntryKind, LogPayloadByKind } from "../src/generated";
import {
  appendEntry,
  entryHash,
  GENESIS_PREV_HASH,
  logSigningMessage,
  payloadHash,
  signEscalationAnswer,
  signRevocation,
} from "../src/log";
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

/** End of the demo escalation window (decided 02:12, window [F31] placeholder). */
export const ESCALATION_EXPIRES = "2026-10-03T02:21:00Z";

/** decision.schema.json examples[0]: a DENY (R3) for attempt 3, as a fresh copy. */
export function decisionExample(): Decision {
  return schemaExample<Decision>("decision.schema.json");
}

/** An APPROVE built from the schema example: R3 passes, no explanation, limit = cart total (I2). */
export function approveOf(id: string, cart: Cart, extra: Partial<Decision> = {}): Decision {
  const { explanation: _explanation, ...rest } = decisionExample();
  const rules = rest.rules.map((r) => {
    if (r.id !== "R3") return r;
    const { verdict: _verdict, template_id: _template, ...passing } = r;
    return { ...passing, result: "PASS" as const };
  }) as Decision["rules"];
  return { ...rest, id, cart, rules, outcome: "APPROVE", approved_limit_minor: cart.total_minor, ...extra };
}

/** An open ESCALATE built from the schema example (its cart unless another is given). */
export function escalateOf(id: string, cart?: Cart): Decision {
  const base = decisionExample();
  return { ...base, id, cart: cart ?? base.cart, outcome: "ESCALATE", escalation: { state: "OPEN", expires_at: ESCALATION_EXPIRES } };
}

/** The schema example card, minted for `decision` at its approved limit. */
export function cardFor(decision: Decision, cardId: string): CardRecord {
  const card = schemaExample<CardRecord>("card-record.schema.json");
  return { ...card, id: cardId, decision_id: decision.id, limit_minor: decision.approved_limit_minor ?? 0 };
}

function approveDecision(): Decision {
  return approveOf("dec_demoA1", loadFixture("carts/attempt-1.json", "cart"));
}

function escalateDecision(): Decision {
  return escalateOf("dec_demoE1");
}

function answeredDecision(answer: NonNullable<NonNullable<Decision["escalation"]>["answer"]>): Decision {
  return {
    ...decisionExample(),
    id: "dec_demoE2",
    resolves: "dec_demoE1",
    outcome: "DENY",
    escalation: { state: "DENIED", expires_at: ESCALATION_EXPIRES, answer },
  };
}

export type DemoStep = { readonly [K in LogEntryKind]: { readonly kind: K; readonly payload: LogPayloadByKind[K] } }[LogEntryKind];

/** The SIMULATED storyline as (kind, payload) steps, seq 0..9. */
export function demoSteps(keys: DemoKeys = demoKeys()): DemoStep[] {
  const card = schemaExample<CardRecord>("card-record.schema.json");
  const escalated = escalateDecision();
  const answer = signEscalationAnswer(
    { decision_id: escalated.id, mandate_id: escalated.mandate_id, cart: escalated.cart, choice: "DENY", answered_at: new Date("2026-10-03T02:20:30Z") },
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
    { kind: "DECISION", payload: escalated },
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

/**
 * A malicious operator holding the engine key: recomputes payload_hash, prev_hash, entry_hash and the
 * engine signature for every entry in order, keeping log_id, seq, kind, ts and payload as given. Only
 * delegator signatures, bindings and the external checkpoint can catch what this rewrites.
 */
export function resignChain(entries: readonly Record<string, unknown>[], engine: Signer): Record<string, unknown>[] {
  let prev = GENESIS_PREV_HASH;
  return entries.map((e) => {
    const header = {
      v: 1 as const,
      log_id: e["log_id"] as string,
      seq: e["seq"] as number,
      kind: e["kind"] as LogEntryKind,
      ts: e["ts"] as string,
      prev_hash: prev,
      payload_hash: payloadHash(e["payload"]),
      signer: engine.did,
    };
    const hash = entryHash(header);
    prev = hash;
    return { ...header, payload: e["payload"], entry_hash: hash, signature: toBase64url(engine.sign(logSigningMessage(hash))) };
  });
}
