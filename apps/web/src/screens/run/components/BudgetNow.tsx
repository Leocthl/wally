// The budget after this purchase: what is left of the sealed total, counting down from the figure before the decision.
// The moving number is decoration; the bar's aria-valuetext carries the exact figure.
import type { ReactElement } from "react";
import type { PacketState } from "../../../api/types";
import { formatHkd } from "../../../domain/money";
import { SIMULATED } from "../../../domain/provenance";
import { UI } from "../../../i18n/ui";
import { ProvenanceChip } from "../../../ui/Chip";
import { ProgressBar } from "../../../ui/Data";
import { useLocale } from "../../../ui/locale";
import { useCountUp } from "../hooks";

const R = UI.run;

export function BudgetNow({ packet, fromMinor, animate }: { readonly packet: PacketState; readonly fromMinor: number; readonly animate: boolean }): ReactElement {
  const { t } = useLocale();
  const shown = useCountUp(packet.remaining_minor, fromMinor, animate);
  const left = formatHkd(packet.remaining_minor);
  const total = formatHkd(packet.budget_minor);
  return (
    <div className="run-budget">
      <div className="run-budget__row">
        <span className="run-budget__label">{t(R.budgetLeft)}</span>
        <span className="run-budget__value">
          <span aria-hidden="true">{formatHkd(shown)}</span>
          <span className="sr-only">{left}</span>
        </span>
      </div>
      <ProgressBar role="meter" size="sm" value={packet.remaining_minor} max={packet.budget_minor} label={t(R.budgetLeft)} valueText={t(R.budgetLeftOf(left, total))} />
      <span className="run-budget__sub">{t(R.budgetLeftOf(left, total))} <ProvenanceChip prov={SIMULATED} /></span>
    </div>
  );
}
