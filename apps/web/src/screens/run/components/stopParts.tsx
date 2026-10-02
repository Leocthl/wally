// Pieces of the "Stopped before paying" screen: the thing that was not bought, the safe strip (nothing charged, the budget
// untouched), the four-step path Wally took, and the actions. Shared with the dev-only variant layouts.
import type { CSSProperties, ReactElement } from "react";
import type { PacketState } from "../../../api/types";
import { formatHkd } from "../../../domain/money";
import { cartProv, SIMULATED } from "../../../domain/provenance";
import type { LabelPair } from "../../../i18n/label";
import { RUNX } from "../../../i18n/runMore";
import { UI } from "../../../i18n/ui";
import { Button } from "../../../ui/Button";
import { ProvenanceChip } from "../../../ui/Chip";
import { cx } from "../../../ui/cx";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { itemTitle, shopName } from "../model/item";
import type { StopView } from "../model/stop";

const R = UI.run;

/** The thing that was not bought: its name and shop, and the price struck through (it did not move). */
export function ItemLine({ view }: { readonly view: StopView }): ReactElement {
  return (
    <div className="run-item-line">
      <span className="run-item-line__thumb" aria-hidden="true"><Icon name="tag" size={22} /></span>
      <span className="run-item-line__text">
        <span className="run-item-line__title">{itemTitle(view.cart)}</span>
        <span className="run-item-line__shop">{shopName(view.cart)}</span>
      </span>
      <span className="run-item-line__price">
        <s data-selectable>{formatHkd(view.cart.total_minor)}</s>
        <ProvenanceChip prov={cartProv(view.cart)} />
      </span>
    </div>
  );
}

/** Money is safe: no card, nothing to charge, and what is left in the budget has not changed. */
export function SafeStrip({ view, packet }: { readonly view: StopView; readonly packet: PacketState | null | undefined }): ReactElement {
  const { t } = useLocale();
  return (
    <div className="run-safe">
      <Icon name="shieldCheck" size={22} />
      <div className="run-safe__text">
        <p className="run-safe__main">{t(view.cancelled ? R.cardCancelled : R.noCard)}</p>
        {packet ? (
          <p className="run-safe__sub">
            {t(RUNX.budgetUntouched(formatHkd(packet.remaining_minor)))} <ProvenanceChip prov={SIMULATED} />
          </p>
        ) : null}
      </div>
    </div>
  );
}

type Cell = "done" | "stop" | "none";
const CELLS: readonly { readonly id: string; readonly label: LabelPair; readonly status: Cell }[] = [
  { id: "pick", label: RUNX.pathPick, status: "done" },
  { id: "read", label: RUNX.pathRead, status: "done" },
  { id: "rules", label: RUNX.pathRules, status: "stop" },
  { id: "card", label: RUNX.pathCard, status: "none" },
];
const SPOKEN = { done: RUNX.pathDone, stop: RUNX.pathStopped, none: RUNX.pathNone } as const;

/** Wally's four steps in one line: picked, read the listing, rules check (stopped here), no card. Replays once on arrival. */
export function StopPath({ fresh }: { readonly fresh: boolean }): ReactElement {
  const { t } = useLocale();
  return (
    <ol className={cx("run-path", fresh && "run-path--enter")} aria-label={t(R.stepsLabel)}>
      {CELLS.map((cell, i) => (
        <li key={cell.id} className="run-path__cell" data-status={cell.status} style={{ ["--i" as string]: i } as CSSProperties}>
          <span className="run-path__disc" aria-hidden="true">
            {cell.status === "done" ? <Icon name="check" size={16} strokeWidth={2.8} /> : cell.status === "stop" ? <Icon name="hand" size={16} strokeWidth={2.4} /> : <span className="run-path__dot" />}
          </span>
          <span className="run-path__label">{t(cell.label)}<span className="sr-only">, {t(SPOKEN[cell.status])}</span></span>
        </li>
      ))}
    </ol>
  );
}

export interface StopActionsProps {
  readonly view: StopView;
  readonly onWhy: () => void;
  readonly onTopUp: () => void;
  readonly onAsk: () => void;
  readonly onCheaper?: (() => void) | undefined;
}

export function StopActions({ view, onWhy, onTopUp, onAsk, onCheaper }: StopActionsProps): ReactElement {
  const { t } = useLocale();
  return (
    <div className="run-actions">
      {onCheaper && view.budget ? <Button size="lg" block onClick={onCheaper}>{t(R.cheaper)}</Button> : null}
      {view.budget ? (
        <Button size="lg" variant={onCheaper ? "secondary" : "primary"} block icon={<Icon name="plus" size={20} />} onClick={onTopUp}>{t(R.topUp)}</Button>
      ) : (
        <Button size="lg" variant="secondary" block icon={<Icon name="sparkle" size={20} />} onClick={onAsk}>{t(R.ask)}</Button>
      )}
      <Button variant="ghost" block onClick={onWhy} icon={<Icon name="info" size={20} />}>{t(R.why)}</Button>
    </div>
  );
}
