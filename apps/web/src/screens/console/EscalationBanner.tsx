// "Wally needs your OK": an open escalation waits for an answer. The banner names the item, the amount and the time left,
// and links to the answer on Wally's screen (the Needs-your-OK screen itself belongs to the Wally route).
import type { ReactElement } from "react";
import type { EscalationView } from "../../api/types";
import { SIMULATED } from "../../domain/provenance";
import { PARAM, routeHref } from "../../hooks/useRoute";
import { UI } from "../../i18n/ui";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { Card } from "../../ui/Surface";
import { Fig, Fill, Money } from "../../shell/figures";
import { formatCountdown } from "../../shell/format";
import { useNow } from "../../shell/useNow";

const PROV = SIMULATED;

export function EscalationBanner({ escalation, title }: { readonly escalation: EscalationView; readonly title: string | null }): ReactElement {
  const { t } = useLocale();
  const now = useNow(true);
  const left = Date.parse(escalation.expiresAt) - now;
  return (
    <Card tone="warn" className="console-esc" aria-labelledby="console-esc-title" data-escalation={escalation.decisionId}>
      <span className="console-esc__icon"><Icon name="clock" /></span>
      <h2 id="console-esc-title" className="console-esc__title">{t(UI["home.escTitle"])}</h2>
      <p className="console-esc__body">
        <Fill
          text={t(UI["home.escBody"])}
          slots={{
            item: <span data-ident>{title ?? escalation.merchantName}</span>,
            amount: <Money minor={escalation.totalMinor} prov={PROV} />,
            time: <Fig prov={PROV} kind="time">{formatCountdown(left)}</Fig>,
          }}
        />
      </p>
      <a className="w-btn w-btn--primary w-btn--md console-esc__go" href={routeHref("wally", { [PARAM.decision]: escalation.decisionId })}>
        <span className="w-btn__label">{t(UI["home.escReview"])}</span>
        <span className="w-btn__icon"><Icon name="chevronRight" size={20} /></span>
      </a>
    </Card>
  );
}
