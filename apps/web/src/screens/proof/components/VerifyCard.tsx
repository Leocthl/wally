// The one calm card on Proof: ready, checking, verified or broken. Verified names the entry count, the head hash and
// the checkpoint; broken names the receipt, the reason in the verifier page's words, the code, and what changed in the
// copy. What this mode could not check is said, never implied.
import type { ReactElement, ReactNode } from "react";
import type { LogView, VerifyOutcome } from "../../../api/types";
import { ChipScope } from "../../../components/ChipScope";
import { Num } from "../../../components/Num";
import { SIMULATED } from "../../../domain/provenance";
import { UI } from "../../../i18n/ui";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Surface";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { checkWords, fieldWords, ranOnDevice, reasonWords } from "../verifyWords";
import { ChainStrip } from "./ChainStrip";
import { Fill, HashId, SeqId } from "./Fill";

const P = UI.proof;

export type ProofStatus = "idle" | "checking" | "pass" | "fail";

export interface VerifyCardProps {
  readonly status: ProofStatus;
  readonly outcome: VerifyOutcome | null;
  /** Entries in the copy being checked (the tampered copy during the demo). */
  readonly shownCount: number;
  readonly head: LogView["head"];
  readonly tampered: LogView["tampered"];
  readonly stale: boolean;
  readonly apiKind: string;
  readonly busy: boolean;
  readonly onVerify: () => void;
}

function CheckList({ outcome }: { readonly outcome: VerifyOutcome }): ReactElement {
  const { t } = useLocale();
  const words = (codes: readonly string[]): string => codes.map((c) => (checkWords(c) ? t(checkWords(c)!) : c)).join(", ");
  return (
    <div className="pf-checks">
      <p><span className="pf-checks__label">{t(P.checked)}</span> {words(outcome.checked)}</p>
      {outcome.skipped.length > 0 ? <p className="pf-checks__skipped"><Icon name="info" size={16} /> <span><span className="pf-checks__label">{t(P.notChecked)}</span> {words(outcome.skipped)}</span></p> : null}
    </div>
  );
}

function Changed({ tampered }: { readonly tampered: NonNullable<LogView["tampered"]> }): ReactElement {
  const { t } = useLocale();
  const field = fieldWords(tampered.field);
  const what = <Fill text={t(field.words)} slots={{ seq: <SeqId seq={tampered.seq} /> }} />;
  if (!field.money) return <p className="pf-changed" data-changed><Fill text={t(P.changedRaw)} slots={{ what }} /></p>;
  return (
    <ChipScope provs={[SIMULATED]} place="end" className="pf-changed" chipsClassName="pf-changed__chips">
      <p data-changed>
        <Fill text={t(P.changed)} slots={{ what, before: <Num kind="money" value={tampered.before} prov={SIMULATED} chip="scope" />, after: <Num kind="money" value={tampered.after} prov={SIMULATED} chip="scope" /> }} />
      </p>
    </ChipScope>
  );
}

function Pass({ outcome, head, apiKind }: { readonly outcome: VerifyOutcome & { readonly result: { readonly ok: true } }; readonly head: LogView["head"]; readonly apiKind: string }): ReactElement {
  const { t } = useLocale();
  const r = outcome.result;
  const match = head === null ? "none" : head.seq === r.head.seq && head.entry_hash === r.head.entry_hash ? "match" : "mismatch";
  return (
    <>
      <Head status="pass" title={t(P.passTitle)} />
      <p className="pf-card__body"><Fill text={t(P.passBody)} slots={{ n: <span data-ident>{r.head.seq + 1}</span> }} /></p>
      <p className="pf-card__where">{t(ranOnDevice(apiKind) ? P.passHere : P.passServer)}</p>
      <p className="pf-card__fact" data-checkpoint={match}>
        <span>{t(P.head)} <SeqId seq={r.head.seq} /> <HashId hash={r.head.entry_hash} /></span>{" "}
        <span className={match === "mismatch" ? "pf-card__warn" : undefined}>{t(match === "match" ? P.checkpointMatch : match === "mismatch" ? P.checkpointMismatch : P.checkpointNone)}</span>
      </p>
    </>
  );
}

function Fail({ outcome, tampered }: { readonly outcome: VerifyOutcome & { readonly result: { readonly ok: false } }; readonly tampered: LogView["tampered"] }): ReactElement {
  const { t } = useLocale();
  const r = outcome.result;
  const reason = reasonWords(r.reason);
  return (
    <>
      <Head status="fail" title={<Fill text={t(P.failTitle)} slots={{ seq: <SeqId seq={r.failedSeq} /> }} />} />
      <p className="pf-card__body">{reason ? t(reason) : t(P.failUnknown)}</p>
      <p className="pf-card__fact"><span>{t(P.code)}</span> <code className="pf-code" data-ident data-reason={r.reason}>{r.reason}</code></p>
      {tampered ? <Changed tampered={tampered} /> : null}
      <p className="pf-card__note">{t(P.failAfter)}</p>
    </>
  );
}

const TONE = { idle: "surface", checking: "surface", pass: "ok", fail: "stop" } as const;
const ICON = { idle: "shield", checking: "shield", pass: "shieldCheck", fail: "shieldAlert" } as const;

/** Icon and title on one row; everything after spans the card, so long sentences get the full width. */
function Head({ status, title }: { readonly status: ProofStatus; readonly title: ReactNode }): ReactElement {
  return (
    <div className="pf-card__head">
      <span className={`pf-card__icon pf-card__icon--${status}`}><Icon name={ICON[status]} size={30} /></span>
      <h2 className="pf-card__title">{title}</h2>
    </div>
  );
}

export function VerifyCard({ status, outcome, shownCount, head, tampered, stale, apiKind, busy, onVerify }: VerifyCardProps): ReactElement {
  const { t } = useLocale();
  const result = outcome?.result ?? null;
  const strip = status === "pass" || status === "fail" ? (result && result.ok ? { ok: true as const } : result ? { ok: false as const, failedSeq: result.failedSeq } : null) : null;
  return (
    <Card tone={TONE[status]} padding="lg" elevated={status === "idle" || status === "checking"} className="pf-card" data-status={status}>
      <div className="pf-card__text" role="status" aria-live="polite">
        {status === "idle" ? (
          <>
            <Head status="idle" title={<Fill text={t(P.idleTitle)} slots={{ n: <span data-ident>{shownCount}</span> }} />} />
            <p className="pf-card__body">{t(P.idleBody)}</p>
          </>
        ) : null}
        {status === "checking" ? <Head status="checking" title={t(P.checking)} /> : null}
        {status === "pass" && outcome && outcome.result.ok ? <Pass outcome={outcome as VerifyOutcome & { readonly result: { readonly ok: true } }} head={head} apiKind={apiKind} /> : null}
        {status === "fail" && outcome && !outcome.result.ok ? <Fail outcome={outcome as VerifyOutcome & { readonly result: { readonly ok: false } }} tampered={tampered} /> : null}
        {stale ? <p className="pf-card__note pf-card__note--stale">{t(P.stale)}</p> : null}
      </div>
      <ChainStrip total={shownCount} result={strip} runKey={outcome?.at ?? "idle"} />
      {outcome && (status === "pass" || status === "fail") ? <CheckList outcome={outcome} /> : null}
      <Button size="lg" block variant={status === "idle" ? "primary" : "secondary"} loading={status === "checking"} disabled={busy && status !== "checking"} icon={<Icon name="shieldCheck" size={22} />} onClick={onVerify}>
        {t(status === "idle" ? P.verify : P.verifyAgain)}
      </Button>
    </Card>
  );
}
