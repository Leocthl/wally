// Variant 3, "Permission slip": a calm white slip rather than a yellow alert. An amber header carries the question and the
// clock; below, three plain rows (what, how much, then what happens), the two answers side by side, and a signed note.
// No sheet, no hold: the least ceremony that still makes the consent explicit.
import type { ReactElement } from "react";
import { formatHkd } from "../../../../domain/money";
import { cartProv } from "../../../../domain/provenance";
import { RUNX } from "../../../../i18n/runMore";
import { UI } from "../../../../i18n/ui";
import { Button } from "../../../../ui/Button";
import { ProvenanceChip } from "../../../../ui/Chip";
import { Icon } from "../../../../ui/icons";
import { useLocale } from "../../../../ui/locale";
import { Wally } from "../../../../wally/Wally";
import { Countdown, useOkClock } from "../../components/okParts";
import { itemTitle, shopName } from "../../model/item";
import { plainReason } from "../../model/reason";
import type { OkVariantProps } from "./types";

const R = UI.run;

export function NeedsOkSlip(p: OkVariantProps): ReactElement | null {
  const { t } = useLocale();
  const clock = useOkClock(p.result, p.now);
  const chain = p.result.chain;
  if (!chain) return null;
  const cart = chain.current.cart;
  const amount = formatHkd(cart.total_minor);
  return (
    <div className="run-stack kv-slipview" data-run-state="needsOk">
      <section className="kv-slip" aria-labelledby="kv-slip-title">
        <header className="kv-slip__head">
          <Wally state="thinking" size={56} decorative />
          <div className="kv-slip__titles">
            <h2 id="kv-slip-title" className="kv-slip__title" tabIndex={-1} ref={p.headingRef}>{t(R.needsOkTitle)}</h2>
            <p className="kv-slip__reason">{t(plainReason(chain.current))}</p>
          </div>
        </header>
        <div className="kv-slip__clock"><Countdown clock={clock} /></div>
        <dl className="kv-slip__rows">
          <div><dt><Icon name="tag" size={18} /> {t(RUNX.slipWhat)}</dt><dd>{itemTitle(cart)} <span className="kv-slip__muted">{"·"} {shopName(cart)}</span></dd></div>
          <div><dt><Icon name="receipt" size={18} /> {t(RUNX.slipHowMuch)}</dt><dd><span data-selectable>{amount}</span> <ProvenanceChip prov={cartProv(cart)} /></dd></div>
          <div><dt><Icon name="card" size={18} /> {t(RUNX.slipThen)}</dt><dd>{t(RUNX.willMake(amount))} {t(RUNX.onlyThisShop(shopName(cart)))}</dd></div>
        </dl>
        <p className="sr-only" aria-live="polite">{clock.announcement}</p>
        <div className="kv-slip__answers">
          <Button size="lg" variant="secondary" disabled={clock.over || p.answering === "APPROVE"} loading={p.answering === "DENY"} onClick={() => p.onAnswer("DENY")}>{t(R.noThanks)}</Button>
          <Button size="lg" disabled={clock.over || p.answering === "DENY"} loading={p.answering === "APPROVE"} onClick={() => p.onAnswer("APPROVE")} icon={<Icon name="check" size={20} />}>{t(R.approve)}</Button>
        </div>
        <p className="kv-fine"><Icon name="shieldCheck" size={16} /> {t(R.answerLimit)} {t(RUNX.signedNote)}</p>
      </section>
      <Button variant="ghost" block onClick={p.onWhy} icon={<Icon name="info" size={20} />}>{t(R.whyAsk)}</Button>
    </div>
  );
}
