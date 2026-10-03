// The one calm card on plain Proof: the verdict first, in everyday words. Untouched says how many receipts and where the
// check ran; changed says which receipt and why, in a sentence with no code; ready and checking say what will happen.
// It keeps the pf-card class, the data-status attribute and its one button, which the end-to-end checks rely on.
import type { ReactElement } from "react";
import type { VerifyOutcome } from "../../../api/types";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Surface";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { PLAIN } from "../plainStrings";
import { plainReasonWords, receiptNumber } from "../plainWords";
import { ranOnDevice } from "../verifyWords";
import { Fill } from "./Fill";
import { Head, TONE, type ProofStatus } from "./VerifyCard";

type Ok = VerifyOutcome & { readonly result: { readonly ok: true } };
type Bad = VerifyOutcome & { readonly result: { readonly ok: false } };

const id = (n: number): ReactElement => <span data-ident>{n}</span>;
const SIGNATURE_CHECKS: readonly string[] = ["SIGNATURE", "PAYLOAD_SIGNATURE"];

function Untouched({ outcome, apiKind }: { readonly outcome: Ok; readonly apiKind: string }): ReactElement {
  const { t } = useLocale();
  const n = outcome.result.head.seq + 1;
  const skipped = outcome.skipped;
  return (
    <>
      <Head status="pass" title={n === 1 ? t(PLAIN.passTitleOne) : <Fill text={t(PLAIN.passTitle)} slots={{ n: id(n) }} />} />
      <p className="pf-card__body">{t(n === 1 ? PLAIN.passBodyOne : PLAIN.passBody)}</p>
      <p className="pf-card__where">{t(ranOnDevice(apiKind) ? PLAIN.wherePhone : PLAIN.whereBooth)}</p>
      {skipped.length > 0 ? <p className="pf-card__note">{t(skipped.some((c) => SIGNATURE_CHECKS.includes(c)) ? PLAIN.skipSignatures : PLAIN.skipOther)}</p> : null}
    </>
  );
}

function Changed({ outcome, count }: { readonly outcome: Bad; readonly count: number }): ReactElement {
  const { t } = useLocale();
  const r = outcome.result;
  const sentences = [r.failedSeq > 0 ? t(PLAIN.failBefore) : null, r.failedSeq < count - 1 ? t(PLAIN.failAfter) : null].filter((s): s is string => s !== null);
  return (
    <>
      <Head status="fail" title={<Fill text={t(PLAIN.failTitle)} slots={{ n: id(receiptNumber(r.failedSeq)) }} />} />
      <p className="pf-card__body">{t(plainReasonWords(r.reason))}</p>
      {sentences.length > 0 ? <p className="pf-card__note">{sentences.join(" ")}</p> : null}
    </>
  );
}

export interface PlainStatusCardProps {
  readonly status: ProofStatus;
  readonly outcome: VerifyOutcome | null;
  /** Receipts on screen (the changed copy during the demo). */
  readonly count: number;
  readonly stale: boolean;
  readonly apiKind: string;
  readonly busy: boolean;
  readonly onCheck: () => void;
}

export function PlainStatusCard({ status, outcome, count, stale, apiKind, busy, onCheck }: PlainStatusCardProps): ReactElement {
  const { t } = useLocale();
  const one = count === 1;
  return (
    <Card tone={TONE[status]} padding="lg" elevated={status === "idle" || status === "checking"} className="pf-card pf-card--plain" data-status={status}>
      <div className="pf-card__text" role="status" aria-live="polite">
        {status === "idle" ? (
          <>
            <Head status="idle" title={<Fill text={t(one ? PLAIN.idleTitleOne : PLAIN.idleTitle)} slots={{ n: id(count) }} />} />
            <p className="pf-card__body">{t(one ? PLAIN.idleBodyOne : PLAIN.idleBody)}</p>
          </>
        ) : null}
        {status === "checking" ? <Head status="checking" title={t(PLAIN.checking)} /> : null}
        {status === "pass" && outcome && outcome.result.ok ? <Untouched outcome={outcome as Ok} apiKind={apiKind} /> : null}
        {status === "fail" && outcome && !outcome.result.ok ? <Changed outcome={outcome as Bad} count={count} /> : null}
        {stale ? <p className="pf-card__note pf-card__note--stale">{t(PLAIN.stale)}</p> : null}
      </div>
      <Button size="lg" block variant={status === "idle" ? "primary" : "secondary"} loading={status === "checking"} disabled={busy && status !== "checking"} icon={<Icon name="shieldCheck" size={22} />} onClick={onCheck}>
        {t(status === "idle" ? PLAIN.check : PLAIN.checkAgain)}
      </Button>
    </Card>
  );
}
