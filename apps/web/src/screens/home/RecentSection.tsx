// Recent: the last three purchases of this budget, one row each. A row says what happened in words beside an icon (paid, stopped
// before paying, waiting for your OK...), carries the number of the receipt that says so, the same one the Receipts list shows on
// that purchase's row and its sheet, and the amount, and opens that purchase on Wally's screen.
import type { ReactElement } from "react";
import { SIMULATED } from "../../domain/provenance";
import { PARAM, routeHref } from "../../hooks/useRoute";
import type { LabelPair } from "../../i18n/label";
import { UI } from "../../i18n/ui";
import { useIsDeveloper } from "../../state/displayMode";
import { Icon, type IconName } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { List, ListRow } from "../../ui/Surface";
import { Fill, Money } from "../../shell/figures";
import type { PurchaseState } from "../proof/purchases";
import { receiptNumber, RECEIPT_NO } from "../proof/receiptNo";
import type { RecentRow } from "./selectors";

const R = UI.receipts;

const LOOK: Readonly<Record<PurchaseState, { readonly icon: IconName; readonly tone: "ok" | "stop" | "warn" | "neutral"; readonly label: LabelPair }>> = {
  paid: { icon: "checkCircle", tone: "ok", label: R.statePaid },
  approved: { icon: "checkCircle", tone: "ok", label: R.stateApproved },
  stopped: { icon: "hand", tone: "stop", label: R.stateStopped },
  needsOk: { icon: "clock", tone: "warn", label: R.stateNeedsOk },
  voided: { icon: "card", tone: "neutral", label: R.stateVoided },
  cardExpired: { icon: "clock", tone: "neutral", label: R.stateCardExpired },
};

export function RecentSection({ rows }: { readonly rows: readonly RecentRow[] }): ReactElement {
  const { t } = useLocale();
  const developer = useIsDeveloper();
  // Nothing yet: one quiet line that points at Try asking, not a heading and a link to an empty list.
  if (rows.length === 0) return <p className="home-section__hint" data-recent-empty>{t(UI["home.recentEmpty"])}</p>;
  return (
    <section className="home-section" aria-labelledby="home-recent-title">
      <h2 id="home-recent-title" className="home-section__title">{t(UI["home.recent"])}</h2>
      <a className="home-section__action" href={routeHref("receipts")}>{t(UI["home.seeAll"])}</a>
      <List cards label={t(UI["home.recent"])}>
        {rows.map((r) => (
          <ListRow
            key={r.id}
            className="home-recent"
            href={routeHref("wally", { [PARAM.decision]: r.id })}
            leading={<Icon name={LOOK[r.state].icon} />}
            tone={LOOK[r.state].tone}
            title={<span data-ident>{r.title}</span>}
            subtitle={
              <span data-state={r.state}>
                {t(LOOK[r.state].label)} · {developer ? <span data-ident>#{r.seq}</span> : <Fill text={t(RECEIPT_NO)} slots={{ n: <span data-ident>{receiptNumber(r.seq)}</span> }} />}
              </span>
            }
            trailing={<Money minor={r.totalMinor} prov={SIMULATED} />}
            chevron
          />
        ))}
      </List>
    </section>
  );
}
