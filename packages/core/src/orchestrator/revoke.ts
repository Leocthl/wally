// revoke (A-24, S4): verify the delegator-signed revocation, append MANDATE_REVOKED, void every ACTIVE card through
// the executor (CARD_EVENT VOIDED). Inside the packet queue, so a revoke queued behind a submit waits for its mint
// and then voids the card, and a submit queued behind a revoke decides on a REVOKED packet (DENY R2.revoked).
import type { Revocation } from "../generated";
import { verifyRevocation } from "../log/delegator";
import { StepError, append, emitPacket, flushLog, readEntries, type Ctx, type Sealed } from "./context";
import type { Run } from "./events";
import { activeCardIds, isRevoked } from "./log-view";
import type { RevokeSuccess } from "./types";

function verified(sealed: Sealed, signedRevocation: unknown): Revocation {
  const check = verifyRevocation(signedRevocation, sealed.mandate.delegator);
  if (!check.valid) throw new StepError("INVALID_REVOCATION", `revocation refused (${check.reason}): ${check.detail}`);
  const revocation = signedRevocation as Revocation; // schema-valid and signed by the delegator
  if (revocation.mandate_id !== sealed.mandate.id) throw new StepError("INVALID_REVOCATION", "the revocation names another mandate");
  return revocation;
}

async function voidActive(ctx: Ctx, run: Run, logId: string): Promise<{ voided: readonly string[]; failed: readonly string[] }> {
  let voided: readonly string[] = [];
  let failed: readonly string[] = [];
  for (const cardId of activeCardIds(await readEntries(ctx, logId))) {
    const outcome = await ctx.executor.voidCard({ logId, cardId });
    if (outcome.status === "VOIDED") {
      voided = [...voided, cardId];
      ctx.report.emit({ type: "card.event", runId: run.runId, event: outcome.event, cause: "void" });
    } else {
      failed = [...failed, cardId];
    }
  }
  return { voided, failed };
}

/** Inside the packet queue. */
export async function revokeInQueue(ctx: Ctx, run: Run, sealed: Sealed, signedRevocation: unknown): Promise<RevokeSuccess> {
  const revocation = verified(sealed, signedRevocation);
  const already = isRevoked(await readEntries(ctx, sealed.logId));
  if (!already) await append(ctx, sealed.logId, "MANDATE_REVOKED", revocation);
  await flushLog(ctx, sealed.logId);
  ctx.report.stage(run, "rail", "running", { note: "void ACTIVE cards" });
  const { voided, failed } = await voidActive(ctx, run, sealed.logId);
  ctx.report.stage(run, "rail", failed.length === 0 ? "done" : "error", { note: `${voided.length} voided, ${failed.length} failed` });
  await flushLog(ctx, sealed.logId);
  ctx.report.emit({ type: "mandate.revoked", runId: run.runId, at: ctx.report.at(), voidedCardIds: voided });
  await emitPacket(ctx, sealed.logId);
  return { ok: true, runId: run.runId, revokedAt: revocation.revoked_at, voidedCardIds: voided, failedCardIds: failed, alreadyRevoked: already };
}
