// The changed copy, impossible to miss. While the booth shows a changed copy of the receipts (the tamper demo), every
// load of Proof and Receipts opens with this banner: it says it is a copy, that the stored originals are untouched, what
// changed (receipt number and, for an amount, the before and after with their chips), and gives a one-tap way back.
// Shared by the plain and developer Proof and by Receipts. It shows nothing while no copy is shown. The words are the same
// in both modes; only the numbering follows the mode (plain counts receipts from 1, developer keeps #seq).
import type { ReactElement } from "react";
import type { LogView } from "../../../api/types";
import { ChipScope } from "../../../components/ChipScope";
import { Num } from "../../../components/Num";
import { SIMULATED } from "../../../domain/provenance";
import { useBoothContext } from "../../../hooks/useBooth";
import { useDisplayMode } from "../../../state/displayMode";
import { Button } from "../../../ui/Button";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { Card } from "../../../ui/Surface";
import { PLAIN } from "../plainStrings";
import { plainFieldWords, receiptNumber } from "../plainWords";
import { Fill } from "./Fill";
import { Changed } from "./VerifyCard";

type Copy = NonNullable<LogView["tampered"]>;

/** Plain: "On receipt 2, the cart total went from HK$259 to HK$359." Both amounts wear one SIMULATED chip. */
function PlainChange({ copy }: { readonly copy: Copy }): ReactElement {
  const { t } = useLocale();
  const field = plainFieldWords(copy.field);
  const slots = { n: <span data-ident>{receiptNumber(copy.seq)}</span>, what: t(field.words) };
  if (!field.money) return <p className="pf-banner__change"><Fill text={t(PLAIN.bannerChangeRaw)} slots={slots} /></p>;
  return (
    <ChipScope provs={[SIMULATED]} place="end" className="pf-banner__change" chipsClassName="pf-banner__chips">
      <p>
        <Fill
          text={t(PLAIN.bannerChange)}
          slots={{ ...slots, before: <Num kind="money" value={copy.before} prov={SIMULATED} chip="scope" />, after: <Num kind="money" value={copy.after} prov={SIMULATED} chip="scope" /> }}
        />
      </p>
    </ChipScope>
  );
}

export interface TamperedBannerProps {
  /** Puts the original back (and, on Proof, checks again). */
  readonly onRestore: () => void;
  /** The restore this banner asked for is running. */
  readonly restoring?: boolean;
}

export function TamperedBanner({ onRestore, restoring = false }: TamperedBannerProps): ReactElement | null {
  const { state, busy } = useBoothContext();
  const { t } = useLocale();
  const [mode] = useDisplayMode();
  const copy = state.log.tampered;
  if (copy === null) return null;
  return (
    <Card as="section" tone="stop" padding="md" className="pf-banner" role="alert" data-tampered-banner>
      <div className="pf-banner__row">
        <span className="pf-banner__icon" aria-hidden="true"><Icon name="alert" size={20} /></span>
        <div className="pf-banner__text">
          <p className="pf-banner__title">{t(PLAIN.bannerTitle)}</p>
          {mode === "plain" ? <PlainChange copy={copy} /> : <Changed tampered={copy} />}
        </div>
      </div>
      <Button variant="secondary" block icon={<Icon name="refresh" size={20} />} loading={restoring} disabled={busy && !restoring} onClick={onRestore}>{t(PLAIN.bannerRestore)}</Button>
    </Card>
  );
}
