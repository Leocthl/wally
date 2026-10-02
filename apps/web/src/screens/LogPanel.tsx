// Log + verifier (docs/04 Screens, LEDGER): LogTimeline, Verify, Tamper, Restore, all through the ApiClient.
import type { ReactElement } from "react";
import { LogTimeline } from "../components/LogTimeline";
import { LogVerifyBar } from "../components/LogVerifyBar";
import { SIMULATED } from "../domain/provenance";
import { useBoothContext } from "../hooks/useBooth";

export function LogPanel(): ReactElement {
  const { state, busy, verifyOutcome, verify, tamper, restore } = useBoothContext();
  const { log } = state;
  const failed = verifyOutcome && !verifyOutcome.result.ok ? verifyOutcome.result.failedSeq : undefined;
  return (
    <section className="log-panel" data-register="ledger" aria-label="Log and verifier">
      <LogVerifyBar onVerify={() => void verify()} onTamper={() => void tamper()} onRestore={() => void restore()} tampered={log.tampered !== null} outcome={verifyOutcome} disabled={busy || log.entries.length === 0} />
      <LogTimeline entries={log.shown} prov={SIMULATED} {...(log.tampered ? { changedSeq: log.tampered.seq } : {})} {...(failed === undefined ? {} : { failedSeq: failed })} />
    </section>
  );
}
