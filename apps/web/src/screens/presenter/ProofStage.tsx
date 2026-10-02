// DM7 on the big screen: the Proof card (verify, the chain strip, what was and was not checked) next to Try to tamper and
// Restore, each followed by a fresh check, and the latest receipts. The stored receipts are never changed.
import { useMemo, useState, type ReactElement } from "react";
import { useBoothContext } from "../../hooks/useBooth";
import { Tx } from "../../evidence/components/Tx";
import { UI } from "../../i18n/ui";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { ChipScope } from "../../components/ChipScope";
import { SIMULATED } from "../../domain/provenance";
import { HashId, SeqId } from "../proof/components/Fill";
import { VerifyCard, type ProofStatus } from "../proof/components/VerifyCard";
import { newestFirst, toReceipts } from "../proof/receipts";
import { receiptTitle, STATE_META } from "../proof/receiptWords";

const LATEST = 5;

export function ProofStage(): ReactElement {
  const booth = useBoothContext();
  const { state, verifyOutcome, busy, api } = booth;
  const { t } = useLocale();
  const [action, setAction] = useState<"verify" | "tamper" | "restore" | null>(null);
  const log = state.log;
  const latest = useMemo(() => newestFirst(toReceipts(log.entries)).slice(0, LATEST), [log.entries]);
  const run = async (kind: "verify" | "tamper" | "restore", task: () => Promise<void>): Promise<void> => {
    setAction(kind);
    try {
      await task();
    } finally {
      setAction(null);
    }
  };
  const result = verifyOutcome?.result ?? null;
  const status: ProofStatus = action !== null ? "checking" : result === null ? "idle" : result.ok ? "pass" : "fail";
  return (
    <section className="pr-view pr-proof" aria-labelledby="pr-proof-title" data-view="log">
      <h2 id="pr-proof-title" className="pr-view__title"><Tx text={UI.presenterUi.proofTitle} /></h2>
      <div className="pr-proof__grid">
        <div className="pr-proof__main">
          <VerifyCard status={status} outcome={verifyOutcome} shownCount={log.shown.length} head={log.head} tampered={log.tampered} stale={false} apiKind={api.kind} busy={busy} onVerify={() => void run("verify", () => booth.verify())} />
        </div>
        <div className="pr-proof__side">
          {log.tampered ? (
            <Button variant="secondary" size="lg" block icon={<Icon name="refresh" size={22} />} loading={action === "restore"} onClick={() => void run("restore", async () => { await booth.restore(); await booth.verify(); })}>{t(UI.proof.restore)}</Button>
          ) : (
            <Button variant="danger" size="lg" block icon={<Icon name="alert" size={22} />} loading={action === "tamper"} disabled={log.entries.length === 0} onClick={() => void run("tamper", async () => { await booth.tamper(); await booth.verify(); })}>{t(UI.proof.tamper)}</Button>
          )}
          {log.tampered ? <p className="pr-proof__copy"><Icon name="info" size={22} /> {t(UI.proof.tamperedNote)}</p> : null}
          <ChipScope provs={[SIMULATED]} className="pr-proof__latest" chipsClassName="pr-proof__chips">
            <h3 className="pr-proof__subtitle"><Tx text={UI.presenterUi.latest} /></h3>
            <ol className="pr-receipts">
              {latest.map((r) => {
                const meta = STATE_META[r.state];
                return (
                  <li key={r.seq} className={`pr-receipt pr-receipt--${meta.tone}`} data-seq={r.seq}>
                    <span className="pr-receipt__icon"><Icon name={meta.icon} size={22} /></span>
                    <span className="pr-receipt__text">
                      <span className="pr-receipt__title">{receiptTitle(r, t, true)}</span>
                      <span className="pr-receipt__meta">{t(meta.label)} · <SeqId seq={r.seq} /> · <HashId hash={r.hash} /></span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </ChipScope>
        </div>
      </div>
    </section>
  );
}
