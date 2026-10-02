// Recent: the last three decisions of this budget. Each row says what happened in words beside an icon, carries its
// receipt number and amount, and opens that result on Wally's screen.
import type { ReactElement } from "react";
import { SIMULATED } from "../../domain/provenance";
import { PARAM, routeHref } from "../../hooks/useRoute";
import { UI } from "../../i18n/ui";
import { Icon, type IconName } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { List, ListRow } from "../../ui/Surface";
import { Money } from "../../shell/figures";
import type { DecisionOutcome, DecisionRow } from "./selectors";

const LOOK: Readonly<Record<DecisionOutcome, { readonly icon: IconName; readonly tone: "ok" | "stop" | "warn" }>> = {
  APPROVE: { icon: "checkCircle", tone: "ok" },
  DENY: { icon: "hand", tone: "stop" },
  ESCALATE: { icon: "clock", tone: "warn" },
};

export function RecentSection({ rows }: { readonly rows: readonly DecisionRow[] }): ReactElement {
  const { t } = useLocale();
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
            leading={<Icon name={LOOK[r.outcome].icon} />}
            tone={LOOK[r.outcome].tone}
            title={<span data-ident>{r.title}</span>}
            subtitle={<span data-outcome={r.outcome}>{t(UI[`home.outcome.${r.outcome}`])} · <span data-ident>#{r.seq}</span></span>}
            trailing={<Money minor={r.totalMinor} prov={SIMULATED} />}
            chevron
          />
        ))}
      </List>
    </section>
  );
}
