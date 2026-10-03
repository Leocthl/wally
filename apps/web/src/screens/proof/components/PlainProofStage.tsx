// The Presenter's DM7 beat in plain words (the default): the plain verdict card, "Try changing one receipt" and "Put it back",
// the banner on top while a changed copy is up, and the latest receipts as words with their number, amount and time. It
// shows no hash and no #seq. The big screen is driven by hand, so it checks when the driver presses Check, as before.
// The stored receipts are never changed; the latest list shows the receipts as the card does, the copy while one is up.
import { useMemo, useState, type ReactElement } from "react";
import type { LogEntry } from "../../../api/types";
import { ChipScope } from "../../../components/ChipScope";
import { Num, NumText } from "../../../components/Num";
import { SIMULATED } from "../../../domain/provenance";
import { Tx } from "../../../evidence/components/Tx";
import { useBoothContext } from "../../../hooks/useBooth";
import { UI } from "../../../i18n/ui";
import { Button } from "../../../ui/Button";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { PLAIN } from "../plainStrings";
import { eventWords, receiptNumber } from "../plainWords";
import { toReceipts, type Receipt } from "../receipts";
import { amountProv, shortTime, STATE_META } from "../receiptWords";
import { Fill } from "./Fill";
import { PlainStatusCard } from "./PlainStatusCard";
import { TamperedBanner } from "./TamperedBanner";
import type { ProofStatus } from "./VerifyCard";
import "../proof.css";
import "../proofPlain.css";

const LATEST = 5;

interface Latest {
  readonly entry: LogEntry;
  readonly receipt: Receipt;
}

/** The newest few receipts, newest first, each with the amount and time it was written. */
function newest(entries: readonly LogEntry[]): readonly Latest[] {
  const receipts = toReceipts(entries);
  return entries
    .flatMap((entry, i) => {
      const receipt = receipts[i];
      return receipt === undefined ? [] : [{ entry, receipt }];
    })
    .slice(-LATEST)
    .reverse();
}

function LatestReceipts({ entries, changedSeq }: { readonly entries: readonly LogEntry[]; readonly changedSeq: number | null }): ReactElement {
  const { t } = useLocale();
  const latest = useMemo(() => newest(entries), [entries]);
  return (
    <ChipScope provs={[SIMULATED]} className="pr-proof__latest" chipsClassName="pr-proof__chips">
      <h3 className="pr-proof__subtitle"><Tx text={UI.presenterUi.latest} /></h3>
      <ol className="pr-receipts">
        {latest.map(({ entry, receipt: r }) => {
          const meta = STATE_META[r.state];
          const changed = r.seq === changedSeq;
          return (
            <li key={r.seq} className={`pr-receipt pr-receipt--${meta.tone}`} data-seq={r.seq} {...(changed ? { "data-changed": "" } : {})}>
              <span className="pr-receipt__icon"><Icon name={meta.icon} size={22} /></span>
              <span className="pr-receipt__text">
                <span className="pr-receipt__title">{t(eventWords(entry))}</span>
                <span className="pr-receipt__meta">
                  <Fill text={t(PLAIN.receiptNo)} slots={{ n: <span data-ident>{receiptNumber(r.seq)}</span> }} />
                  {r.amountMinor === null ? null : <>{" · "}<Num kind="money" value={r.amountMinor} prov={amountProv(r)} chip="scope" /></>}
                  {" · "}
                  <NumText text={shortTime(r.ts)} prov={SIMULATED} chip="scope" kind="time" />
                  {changed ? <>{" · "}<span className="pr-receipt__changed">{t(PLAIN.changed)}</span></> : null}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </ChipScope>
  );
}

export function PlainProofStage(): ReactElement {
  const booth = useBoothContext();
  const { state, verifyOutcome, busy, api } = booth;
  const { t } = useLocale();
  const [action, setAction] = useState<"verify" | "tamper" | "restore" | null>(null);
  const log = state.log;
  const run = async (kind: "verify" | "tamper" | "restore", task: () => Promise<void>): Promise<void> => {
    setAction(kind);
    try {
      await task();
    } finally {
      setAction(null);
    }
  };
  const restore = (): void => void run("restore", async () => {
    await booth.restore();
    await booth.verify();
  });
  const result = verifyOutcome?.result ?? null;
  const status: ProofStatus = action !== null ? "checking" : result === null ? "idle" : result.ok ? "pass" : "fail";
  return (
    <section className="pr-view pr-proof" aria-labelledby="pr-proof-title" data-view="log" data-mode="plain">
      <TamperedBanner onRestore={restore} restoring={action === "restore"} />
      <h2 id="pr-proof-title" className="pr-view__title"><Tx text={UI.presenterUi.proofTitle} /></h2>
      <div className="pr-proof__grid">
        <div className="pr-proof__main">
          <PlainStatusCard status={status} outcome={verifyOutcome} count={log.shown.length} stale={false} apiKind={api.kind} busy={busy} onCheck={() => void run("verify", () => booth.verify())} />
        </div>
        <div className="pr-proof__side">
          {log.tampered ? (
            <Button variant="secondary" size="lg" block icon={<Icon name="refresh" size={22} />} loading={action === "restore"} onClick={restore}>{t(PLAIN.restore)}</Button>
          ) : (
            <Button variant="danger" size="lg" block icon={<Icon name="alert" size={22} />} loading={action === "tamper"} disabled={log.entries.length === 0} onClick={() => void run("tamper", async () => { await booth.tamper(); await booth.verify(); })}>{t(PLAIN.tamper)}</Button>
          )}
          <LatestReceipts entries={log.shown} changedSeq={log.tampered?.seq ?? null} />
        </div>
      </div>
    </section>
  );
}
