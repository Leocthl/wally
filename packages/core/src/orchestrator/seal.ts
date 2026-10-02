// seal: verify the AgentDelegationCredential (R1, ADR-0007), then MANDATE_SEALED at seq 0 of log_<mandate>.
// An invalid proof is refused before anything is logged. One orchestrator runs one packet. A credential that names a
// parent (a family budget) also has to be within that parent's (parent.ts); the refusal comes before the log too.
import type { Mandate, MandateCredential } from "../generated";
import { checkpointOf } from "../log/checkpoint";
import { logIdForMandate } from "../log/ids";
import { mandateFromCredential } from "../vc/mandate";
import { verifyMandateCredential } from "../vc/proof";
import { StepError, append, describe, flushLog, now, readLogState, readUnsealed, type Ctx } from "./context";
import type { Run } from "./events";
import { acceptParent, type ParentAcceptance } from "./parent";
import type { SealOptions, SealSuccess } from "./types";

/** A private copy, verified against the pinned delegator; the mandate is built from this same object (no TOCTOU). */
function verified(ctx: Ctx, credential: unknown): MandateCredential {
  let copy: unknown;
  try {
    copy = structuredClone(credential);
  } catch (err) {
    throw new StepError("INVALID_CREDENTIAL", `credential is not plain data: ${describe(err)}`);
  }
  const check = verifyMandateCredential(copy, { expectedIssuer: ctx.deps.delegatorDid });
  if (!check.valid) throw new StepError("INVALID_CREDENTIAL", `credential refused (${check.reason}): ${check.detail}`);
  return copy as MandateCredential; // schema-valid, issued and proof-signed by the pinned delegator
}

async function logSealed(ctx: Ctx, run: Run, vc: MandateCredential, mandate: Mandate, parent: ParentAcceptance | null): Promise<SealSuccess> {
  const logId = logIdForMandate(mandate.id);
  if ((await readUnsealed(ctx, logId)).length > 0) throw new StepError("LOG_EXISTS", `${logId} already has entries; reset the demo data to seal it again`);
  await append(ctx, logId, "MANDATE_SEALED", vc);
  ctx.memory.sealed = { logId, mandate };
  const state = await readLogState(ctx, logId, now(ctx));
  const summary = parent === null ? {} : { parent: parent.summary };
  ctx.report.emit({ type: "mandate.sealed", runId: run.runId, mandate, packet: state.packet, at: ctx.report.at(), ...summary });
  await flushLog(ctx, logId);
  ctx.report.emit({ type: "packet", packet: state.packet });
  const head = state.entries.at(-1);
  if (head === undefined) throw new StepError("LOG_UNAVAILABLE", "the sealed entry is not in the log");
  return { ok: true, runId: run.runId, mandate, packet: state.packet, head: checkpointOf(head), ...summary };
}

/** Inside the packet queue. */
export async function sealInQueue(ctx: Ctx, run: Run, credential: unknown, options: SealOptions = {}): Promise<SealSuccess> {
  if (ctx.memory.sealed !== null) throw new StepError("ALREADY_SEALED", "this orchestrator already runs a packet; start a new one for a new mandate");
  const vc = verified(ctx, credential);
  const mandate = mandateFromCredential(vc);
  const parent = acceptParent(ctx, vc, mandate, options.parentCredential);
  try {
    return await logSealed(ctx, run, vc, mandate, parent);
  } catch (err) {
    if (ctx.memory.sealed === null) parent?.release(); // nothing was sealed, so the parent's room is free again
    throw err;
  }
}
