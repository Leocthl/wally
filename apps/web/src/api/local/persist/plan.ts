// From stored text to a restore plan, or a reason not to restore. Pure and synchronous: nothing is built, signed or written
// here. In order: the record (strict shape, this version, size), the two keys (valid for their slots, and two different
// keys), the log (every line is JSON), the whole hash chain with the engine key and the delegator key the record names
// (every signature, the seal by the pinned delegator) ending exactly at the stored head, a budget that is not a family
// budget (Mum's key is not kept, so her ceiling could not be checked again), and a budget that has not ended. The first
// failure wins and the page starts fresh; a record is never half-trusted.
// What this is and is not: it finds damage and stray edits (a log changed, reordered, cut or extended after it was signed).
// It is not authentication. The keys are stored beside the log, so whoever can write this storage can write a log that
// verifies, or cut entries and move the head with them; the demo keys are throwaway and SIMULATED (KEYS.md).
import type { LogEntry, MandateCredential } from "@wally/core/generated";
import type { Checkpoint } from "@wally/core/ports";
import { mandateIdFromCredentialId } from "@wally/core/vc";
import { verifyChain } from "@wally/core/verify";
import type { SealRequest } from "../../types";
import type { DemoKeys } from "../../../booth/backend/keys";
import { keysFromFiles, type KeyFiles } from "./keys";
import { decodeRecord, type RecordProblem } from "./record";

export type RestoreProblem = RecordProblem | "KEYS" | "LOG" | "CHAIN" | "FAMILY" | "EXPIRED";

export interface RestorePlan {
  /** The two keys that signed the log, to sign the next entries with. */
  readonly keys: DemoKeys;
  /** The same keys in their stored form, for the next save. */
  readonly files: KeyFiles;
  /** The stored log, verified end to end. */
  readonly entries: readonly LogEntry[];
  /** Seq 0's payload: the signed credential the seal is made again with. */
  readonly credential: MandateCredential;
  /** What the credential was made from; the page seals this to open the session again. */
  readonly sealRequest: SealRequest;
  readonly mandateId: string;
  readonly head: Checkpoint;
}

export type PlanResult =
  | { readonly kind: "plan"; readonly plan: RestorePlan }
  | { readonly kind: "ended"; readonly problem: RestoreProblem; readonly detail?: string };

const ended = (problem: RestoreProblem, detail?: string): PlanResult => ({ kind: "ended", problem, ...(detail === undefined ? {} : { detail }) });

/** A budget that is Mei's share of Mum's names its parent in the credential. */
export function credentialIsFamily(credential: MandateCredential): boolean {
  return credential.credentialSubject.parent !== undefined;
}

/** The lines of a JSONL log as parsed JSON; null when a line is empty or not JSON. */
function parseLines(log: string): unknown[] | null {
  const lines = log.split("\n").slice(0, -1); // the record guarantees a final newline
  if (lines.some((line) => line === "")) return null;
  try {
    return lines.map((line): unknown => JSON.parse(line));
  } catch {
    return null;
  }
}

/** `now` decides only whether the budget has ended; the time the record was saved decides nothing. */
export function planRestore(text: string, now: Date): PlanResult {
  const decoded = decodeRecord(text);
  if (!decoded.ok) return ended(decoded.problem);
  const { record } = decoded;
  let keys: DemoKeys;
  try {
    keys = keysFromFiles(record.keys);
  } catch {
    return ended("KEYS", "the stored keys are not a valid engine key and delegator key"); // never the library's message: it could name a field
  }
  const parsed = parseLines(record.log);
  if (parsed === null) return ended("LOG", "a line of the stored log is empty or not JSON");
  const report = verifyChain(parsed, { engine: [keys.engine.did], delegator: keys.delegator.did }, record.head);
  if (!report.ok) return ended("CHAIN", `seq ${report.failedSeq}: ${report.reason}`);
  if (report.head.seq !== record.head.seq || report.head.entry_hash !== record.head.entry_hash) return ended("CHAIN", "the stored log goes on past its stored head");
  const entries = parsed as LogEntry[]; // verifyChain checked every one against the log entry schema
  const first = entries[0];
  if (first?.kind !== "MANDATE_SEALED") return ended("LOG", "the stored log does not start with the seal");
  const credential = first.payload;
  if (credentialIsFamily(credential)) return ended("FAMILY", "a family budget needs Mum's key, which is never kept");
  if (now.getTime() >= Date.parse(credential.validUntil)) return ended("EXPIRED", `the budget ended at ${credential.validUntil}`);
  const { intent_text: intentText, rules } = credential.credentialSubject;
  return {
    kind: "plan",
    plan: {
      keys,
      files: record.keys,
      entries,
      credential,
      sealRequest: { intentText, rules, validUntil: credential.validUntil },
      mandateId: mandateIdFromCredentialId(credential.id),
      head: record.head,
    },
  };
}
