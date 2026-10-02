// Wally is shopping: the item (a skeleton until Wally has picked), then the four steps in plain words with quiet
// times. One polite live region speaks the step in progress; the list itself stays silent.
import type { ReactElement } from "react";
import type { ApiInfo } from "../../../api/types";
import { formatHkd } from "../../../domain/money";
import { cartProv, measured, SIMULATED, type Prov } from "../../../domain/provenance";
import { UI } from "../../../i18n/ui";
import { ProvenanceChip } from "../../../ui/Chip";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { Steps } from "../../../ui/Steps";
import { Card, Skeleton } from "../../../ui/Surface";
import type { RunView } from "../../../state/booth";
import { itemTitle, shopName } from "../model/item";
import { activeStep, stepsFor } from "../model/steps";

const R = UI.run;

/** Stage times: a live server timed them once (MEASURED, n=1); the offline mock replays recorded pauses (SIMULATED). */
export function stageProv(info: ApiInfo | null): Prov {
  return info?.kind === "http" ? measured(1) : SIMULATED;
}

function seconds(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function Item({ run }: { readonly run: RunView }): ReactElement {
  const cart = run.cart;
  return (
    <Card elevated className="run-item" aria-busy={cart ? undefined : true}>
      <span className="run-item__thumb" aria-hidden="true"><Icon name="tag" size={28} /></span>
      <span className="run-item__text">
        {cart ? (
          <>
            <span className="run-item__title">{itemTitle(cart)}</span>
            <span className="run-item__meta">{shopName(cart)}</span>
            <span className="run-item__price"><span data-selectable>{formatHkd(cart.total_minor)}</span> <ProvenanceChip prov={cartProv(cart)} /></span>
          </>
        ) : (
          <>
            <Skeleton width="9rem" height="1.25rem" />
            <Skeleton width="6rem" height="0.875rem" />
            <Skeleton width="4.5rem" height="1rem" />
          </>
        )}
      </span>
    </Card>
  );
}

export function Progress({ run, info }: { readonly run: RunView; readonly info: ApiInfo | null }): ReactElement {
  const { t } = useLocale();
  const steps = stepsFor(run);
  const active = activeStep(steps);
  const prov = stageProv(info);
  const timed = steps.some((s) => s.latencyMs !== undefined);
  return (
    <div className="run-stack" data-run-state="working">
      <Item run={run} />
      <Card className="run-steps">
        <Steps
          label={t(R.stepsLabel)}
          items={steps.map((s) => ({
            id: s.id,
            title: t(s.title),
            detail: t(s.detail),
            status: s.status,
            ...(s.latencyMs === undefined ? {} : { time: seconds(s.latencyMs) }),
          }))}
        />
        {timed ? <p className="run-note"><ProvenanceChip prov={prov} /> {t(prov.kind === "MEASURED" ? R.timesMeasured : R.timesSimulated)}</p> : null}
      </Card>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {active ? t(R.stepOf(String(active.index + 1), String(steps.length), t(active.step.title))) : ""}
      </p>
    </div>
  );
}
