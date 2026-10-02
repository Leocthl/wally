// Integration rig: the real orchestrator, engine, appendEntry, signers and credential, RailSim and MerchantStub
// (SIMULATED), a FileLogStore in a temp dir, a fake judge keyed by listing text and scripted planners.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ScameterLookup } from "@laisee/core/cart";
import { createSigner, sha256Bytes } from "@laisee/core/crypto";
import { ENGINE_CONFIG } from "@laisee/core/config";
import { createEngine } from "@laisee/core/engine";
import type { ListingRecord, MandateCredential, ProposeCartInput, ScameterCapture } from "@laisee/core/generated";
import { appendEntry, signEscalationAnswer, signRevocation } from "@laisee/core/log";
import { FileLogStore } from "@laisee/core/log/file";
import { createOrchestrator, type Orchestrator, type OrchestratorEvent } from "@laisee/core/orchestrator";
import type { EscalationAnswer, JudgeRecord, MerchantPort, Signer } from "@laisee/core/ports";
import { FakeClock, FakeJudge, FakePlanner } from "@laisee/core/testing";
import { loadFixture } from "@laisee/core/testing/fixtures";
import { signMandateCredential } from "@laisee/core/vc";
import { verifyLogText } from "@laisee/core/verify";
import { MerchantStub, RailSim, seededRandom, sequentialIds, type MerchantMode } from "../src";

export const LOG_ID = "log_demoM0";
export const SEAL_AT = "2026-10-03T02:00:00Z";

const listing = (name: string): ListingRecord => loadFixture(`listings/${name}.json`, "listing-record");
export const TEE = listing("apparel-tee");
export const HOODIE = listing("flagged-seller-hoodie");
export const JACKET = listing("streetwear-jacket");
export const INJECTED = listing("injected-tee");
export const SOCKS = listing("apparel-socks");

function proposal(name: string): ProposeCartInput {
  const recorded = loadFixture(`planner/${name}.json`, "planner-replay").proposal;
  if (recorded === null) throw new Error(`no proposal in planner/${name}`);
  return recorded;
}
export const P_A1 = proposal("attempt-1");
export const P_A2 = proposal("attempt-2");
export const P_A3 = proposal("attempt-3");
export const P_A3B = proposal("attempt-3b");
export const P_A4 = proposal("attempt-4");

const CAPTURES: readonly ScameterCapture[] = ["demo-apparel", "demo-outlet", "demo-streetwear", "flagged-seller"].map((n) =>
  loadFixture(`scameter/${n}.json`, "scameter-capture"),
);
const scameter: ScameterLookup = (ref) => CAPTURES.find((c) => c.capture_ref === ref);

/** Recorded injection answers for the injected listing (SIMULATED fixture); clean answers for everything else. */
const INJECTED_JUDGE: JudgeRecord = loadFixture("judge/injected-tee.json", "judge-record");

const seed = (role: string): Uint8Array => sha256Bytes(`laisee orchestrator integration test key: ${role}`);

export interface Keys {
  readonly engine: Signer;
  readonly delegator: Signer;
  readonly agentDid: string;
}

export function keys(): Keys {
  return { engine: createSigner(seed("engine")), delegator: createSigner(seed("delegator")), agentDid: createSigner(seed("agent")).did };
}

export function credential(k: Keys, validUntil?: string): MandateCredential {
  const { proof: _proof, ...fixture } = loadFixture("mandate/m0.credential.json", "mandate-credential");
  return signMandateCredential(
    { ...fixture, issuer: k.delegator.did, credentialSubject: { ...fixture.credentialSubject, id: k.agentDid }, ...(validUntil === undefined ? {} : { validUntil }) },
    k.delegator,
    { created: new Date(SEAL_AT) },
  );
}

export interface Integration {
  readonly orchestrator: Orchestrator;
  readonly rail: RailSim;
  readonly stub: MerchantStub;
  readonly clock: FakeClock;
  readonly keys: Keys;
  readonly events: OrchestratorEvent[];
  readonly dir: string;
  propose(...proposals: readonly (ProposeCartInput | null)[]): void;
  logText(): Promise<string>;
  kinds(): Promise<readonly string[]>;
  answer(decisionId: string, choice: EscalationAnswer["choice"]): EscalationAnswer;
  revocation(): ReturnType<typeof signRevocation>;
  verify(text: string): ReturnType<typeof verifyLogText>;
  close(): Promise<void>;
}

/** Optional merchant wrapper (for hostile merchants); the stub stays reachable for setMode. */
export type MerchantWrap = (stub: MerchantStub, rail: RailSim) => MerchantPort;

export async function integration(mode: MerchantMode = "honest", wrap?: MerchantWrap): Promise<Integration> {
  const dir = await mkdtemp(join(tmpdir(), "laisee-orch-"));
  const k = keys();
  const clock = new FakeClock(SEAL_AT);
  const rail = new RailSim({ random: seededRandom(7), ids: sequentialIds() });
  const stub = new MerchantStub({ rail, mode });
  const store = new FileLogStore(dir);
  let queue: readonly (ProposeCartInput | null)[] = [];
  let carts = 0;
  let runs = 0;
  const judge = new FakeJudge({ respond: (input) => (input.listingText === INJECTED.text ? { answers: INJECTED_JUDGE.answers ?? {} } : {}) });
  const orchestrator = createOrchestrator({
    engine: createEngine({ config: { ...ENGINE_CONFIG, judge_mode: "enforce" } }), // JUDGE_MODE=enforce
    planner: () => {
      const [next = null, ...rest] = queue;
      queue = rest;
      return new FakePlanner([next]);
    },
    judge,
    rail,
    merchant: wrap === undefined ? stub : wrap(stub, rail),
    store,
    signer: k.engine,
    clock,
    ids: { cartId: () => `crt_int${String((carts += 1)).padStart(6, "0")}`, runId: () => `run_${(runs += 1)}` },
    scameter,
    appendEntry,
    delegatorDid: k.delegator.did,
  });
  const events: OrchestratorEvent[] = [];
  orchestrator.subscribe((e) => events.push(e));
  const logText = () => readFile(store.pathFor(LOG_ID), "utf8");
  return {
    orchestrator,
    rail,
    stub,
    clock,
    keys: k,
    events,
    dir,
    propose: (...proposals) => {
      queue = [...queue, ...proposals];
    },
    logText,
    kinds: async () => (await store.read(LOG_ID)).map((e) => e.kind),
    answer: (decisionId, choice) => signEscalationAnswer({ decision_id: decisionId, choice, answered_at: clock.now() }, k.delegator),
    revocation: () => signRevocation({ mandate_id: "mnd_demoM0", revoked_at: clock.now(), reason: "lost phone (SIMULATED)" }, k.delegator),
    verify: (text) => verifyLogText(text, { engine: [k.engine.did], delegator: k.delegator.did }),
    close: () => rm(dir, { recursive: true, force: true }),
  };
}

/** One byte flipped inside the first amount_minor value of the exported log (a digit becomes another digit). */
export function flipOneByte(text: string): string {
  const at = text.indexOf('"amount_minor":') + '"amount_minor":'.length;
  const digit = text.charAt(at);
  return `${text.slice(0, at)}${digit === "9" ? "8" : "9"}${text.slice(at + 1)}`;
}
