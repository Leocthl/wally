// "Try changing one receipt" on plain Proof: a button that changes one digit in a COPY and checks the copy, then, while the
// copy is shown, one sentence of what just happened (with the amounts under a SIMULATED chip) and "Put it back". The real
// receipts are never touched, and the words say so. The buttons sit in .pf-actions, which the end-to-end checks find.
import type { ReactElement } from "react";
import type { LogView } from "../../../api/types";
import { ChipScope } from "../../../components/ChipScope";
import { Num } from "../../../components/Num";
import { SIMULATED } from "../../../domain/provenance";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Surface";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { PLAIN } from "../plainStrings";
import { plainFieldWords, receiptNumber } from "../plainWords";
import type { ProofAction } from "../useProofCheck";
import { Fill } from "./Fill";

type Changed = NonNullable<LogView["tampered"]>;

/** One sentence: what we changed, where, from what to what, and why the check caught it. Amounts keep their chips. */
function Explanation({ changed }: { readonly changed: Changed }): ReactElement {
  const { t } = useLocale();
  const field = plainFieldWords(changed.field);
  const slots = { n: <span data-ident>{receiptNumber(changed.seq)}</span>, what: t(field.words) };
  if (!field.money) return <p className="pf-explain" data-changed><Fill text={t(PLAIN.explainRaw)} slots={slots} /></p>;
  return (
    <ChipScope provs={[SIMULATED]} place="end" className="pf-explain" chipsClassName="pf-explain__chips">
      <p data-changed>
        <Fill
          text={t(PLAIN.explain)}
          slots={{ ...slots, before: <Num kind="money" value={changed.before} prov={SIMULATED} chip="scope" />, after: <Num kind="money" value={changed.after} prov={SIMULATED} chip="scope" /> }}
        />
      </p>
    </ChipScope>
  );
}

export interface PlainDemoProps {
  readonly changed: LogView["tampered"];
  readonly action: ProofAction | null;
  readonly busy: boolean;
  readonly onTamper: () => void;
  readonly onRestore: () => void;
}

export function PlainDemo({ changed, action, busy, onTamper, onRestore }: PlainDemoProps): ReactElement {
  const { t } = useLocale();
  return (
    <>
      {changed ? (
        <Card tone="info" className="pf-copy" data-tampered-copy>
          <Icon name="info" size={20} />
          <Explanation changed={changed} />
        </Card>
      ) : null}
      <div className="pf-actions">
        {changed ? (
          <Button variant="secondary" block icon={<Icon name="refresh" size={20} />} loading={action === "restore"} disabled={busy && action !== "restore"} onClick={onRestore}>{t(PLAIN.restore)}</Button>
        ) : (
          <Button variant="danger" block icon={<Icon name="alert" size={20} />} loading={action === "tamper"} disabled={busy && action !== "tamper"} onClick={onTamper}>{t(PLAIN.tamper)}</Button>
        )}
        <p className="pf-actions__hint">{t(changed ? PLAIN.restoreHint : PLAIN.tamperHint)}</p>
      </div>
    </>
  );
}
