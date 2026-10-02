// Shared context of one orchestrator: resolved dependencies, the packet queue, the event reporter and the two
// pieces of memory it keeps besides the log: which packet it runs (set once by seal) and how far log events
// have been delivered. Everything else is read from the log inside the queue.
import type { Executor } from "../executor/types";
import type { Exclusive } from "../executor/queue";
import type { LogEntry, LogEntryKind, LogPayloadByKind, Mandate, MandateCredential, PacketState } from "../generated";
import { checkpointOf } from "../log/checkpoint";
import { foldPacket } from "../packet/fold";
import { mandateFromCredential } from "../vc/mandate";
import { verifyMandateCredential } from "../vc/proof";
import type { Reporter, FailureExtra } from "./events";
import { credentialOf } from "./log-view";
import type { OrchestratorConfig, OrchestratorDeps, OrchestratorErrorCode } from "./types";

export interface Sealed {
  readonly logId: string;
  readonly mandate: Mandate;
}

export interface Memory {
  sealed: Sealed | null;
  /** seq of the last log entry delivered as a `log` event (-1 before seal). */
  emittedThrough: number;
}

export interface Ctx {
  readonly deps: OrchestratorDeps;
  readonly config: OrchestratorConfig;
  readonly executor: Executor;
  readonly report: Reporter;
  /** The packet queue: every job that decides, appends, mints or voids runs through it, one at a time. */
  readonly queue: Exclusive;
  readonly memory: Memory;
}

export const PACKET_QUEUE_KEY = "packet";

/** A failed step: becomes an OperationFailure at the operation boundary. */
export class StepError extends Error {
  readonly code: OrchestratorErrorCode;
  readonly extra: FailureExtra;
  constructor(code: OrchestratorErrorCode, message: string, extra: FailureExtra = {}) {
    super(message);
    this.name = "StepError";
    this.code = code;
    this.extra = extra;
  }
}

export const describe = (err: unknown): string => (err instanceof Error ? `${err.name}: ${err.message}` : "unknown error");

export const now = (ctx: Ctx): Date => ctx.deps.clock.now();

export function sealedOrThrow(ctx: Ctx): Sealed {
  if (ctx.memory.sealed === null) throw new StepError("NOT_SEALED", "no mandate is sealed yet");
  return ctx.memory.sealed;
}

/** Everything a decision needs, folded from the log at `at`. */
export interface LogState {
  readonly entries: readonly LogEntry[];
  readonly credential: MandateCredential;
  readonly mandate: Mandate;
  /** verifyMandateCredential over the credential in the log (R1 input). */
  readonly proofValid: boolean;
  readonly packet: PacketState;
}

export async function readEntries(ctx: Ctx, logId: string): Promise<readonly LogEntry[]> {
  try {
    return await ctx.deps.store.read(logId);
  } catch (err) {
    throw new StepError("LOG_UNAVAILABLE", `the log could not be read: ${describe(err)}`);
  }
}

export async function readLogState(ctx: Ctx, logId: string, at: Date): Promise<LogState> {
  const entries = await readEntries(ctx, logId);
  const credential = credentialOf(entries);
  if (credential === null) throw new StepError("LOG_UNAVAILABLE", "the log has no MANDATE_SEALED at seq 0");
  try {
    const packet = foldPacket(entries, at);
    const proofValid = verifyMandateCredential(credential).valid;
    return { entries, credential, mandate: mandateFromCredential(credential), proofValid, packet };
  } catch (err) {
    throw new StepError("LOG_UNAVAILABLE", `the log could not be folded: ${describe(err)}`);
  }
}

/** Emits `log` events for entries not delivered yet, then the new head checkpoint. Never throws. */
export async function flushLog(ctx: Ctx, logId: string): Promise<void> {
  let entries: readonly LogEntry[];
  try {
    entries = await ctx.deps.store.read(logId);
  } catch {
    return; // events are a view; the log stays the record and the next flush catches up
  }
  const fresh = entries.filter((e) => e.seq > ctx.memory.emittedThrough);
  for (const entry of fresh) ctx.report.emit({ type: "log", entry });
  const last = fresh.at(-1);
  if (last === undefined) return;
  ctx.memory.emittedThrough = last.seq;
  ctx.report.emit({ type: "checkpoint", head: checkpointOf(last) });
}

/** Appends one signed entry (I7). Fails with LOG_APPEND_FAILED and no entry written. */
export async function append<K extends LogEntryKind>(ctx: Ctx, logId: string, kind: K, payload: LogPayloadByKind[K], extra: FailureExtra = {}): Promise<LogEntry> {
  try {
    return await ctx.deps.appendEntry(ctx.deps.store, ctx.deps.signer, logId, kind, payload, now(ctx));
  } catch (err) {
    throw new StepError("LOG_APPEND_FAILED", `${kind} could not be appended: ${describe(err)}`, extra);
  }
}

export async function emitPacket(ctx: Ctx, logId: string): Promise<void> {
  try {
    const entries = await ctx.deps.store.read(logId);
    ctx.report.emit({ type: "packet", packet: foldPacket(entries, now(ctx)) });
  } catch {
    // The packet view is derived; a failed refresh is caught up by the next one.
  }
}
