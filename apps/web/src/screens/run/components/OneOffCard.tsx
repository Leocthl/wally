// The one-off card as a dark ticket: last four digits only (no card number, CVV or printed expiry exists, I8), what it
// can do in one line, where and until when, its state, and a SIMULATED chip that never goes away (the rail is SIMULATED).
import type { ReactElement } from "react";
import type { CardRecord } from "../../../api/types";
import { formatHkd } from "../../../domain/money";
import { SIMULATED } from "../../../domain/provenance";
import { formatHkTime } from "../../../domain/time";
import type { LabelPair } from "../../../i18n/label";
import { UI } from "../../../i18n/ui";
import { ProvenanceChip, Tag, type TagTone } from "../../../ui/Chip";
import { cx } from "../../../ui/cx";
import { Icon, type IconName } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { Card, Skeleton } from "../../../ui/Surface";

const R = UI.run;

const STATE: Readonly<Record<CardRecord["state"], { readonly text: LabelPair; readonly tone: TagTone; readonly icon: IconName }>> = {
  ACTIVE: { text: R.cardReady, tone: "ok", icon: "check" },
  USED: { text: R.cardUsed, tone: "info", icon: "checkCircle" },
  VOIDED: { text: R.cardVoided, tone: "neutral", icon: "close" },
  EXPIRED: { text: R.cardExpired, tone: "neutral", icon: "clock" },
};

/** "10:35" in Hong Kong time. */
function hkClock(iso: string): string {
  return formatHkTime(iso).slice(0, 5);
}

export function OneOffCard({ card, shop, enter }: { readonly card: CardRecord | undefined; readonly shop: string; readonly enter: boolean }): ReactElement {
  const { t } = useLocale();
  if (!card) {
    return (
      <Card as="article" tone="ticket" padding="lg" className="run-ticket" aria-busy="true">
        <span className="run-ticket__label"><Icon name="card" size={18} /> {t(R.oneOffCard)}</span>
        <Skeleton width="60%" height="1.75rem" radius="sm" />
        <Skeleton width="80%" height="1.125rem" radius="sm" />
      </Card>
    );
  }
  const state = STATE[card.state];
  const amount = formatHkd(card.limit_minor);
  const spent = card.state !== "ACTIVE";
  return (
    <Card as="article" tone="ticket" padding="lg" className={cx("run-ticket", enter && "run-ticket--enter", spent && "run-ticket--spent")} aria-label={t(R.oneOffCard)} data-card-state={card.state}>
      <Tag tone={state.tone} size="sm" className="w-card__corner" icon={<Icon name={state.icon} size={14} />}>{t(state.text)}</Tag>
      <span className="run-ticket__label"><Icon name="card" size={18} /> {t(R.oneOffCard)}</span>
      <span className="run-ticket__number" data-selectable>
        <span aria-hidden="true">•••• </span>
        <span className="sr-only">{t(R.cardEnding(card.last4))}</span>
        <span aria-hidden="true">{card.last4}</span>
      </span>
      <span className="run-ticket__once">{t(R.worksOnce(amount))}</span>
      <span className="run-ticket__meta">
        {card.merchant_lock ? <span>{t(R.onlyAt(shop))}</span> : null}
        <span>{t(R.expiresAt(hkClock(card.expires_at)))}</span>
        <ProvenanceChip prov={SIMULATED} />
      </span>
    </Card>
  );
}
