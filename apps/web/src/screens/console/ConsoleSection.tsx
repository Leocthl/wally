// Manage this budget: Top up and Change the rules open Seal prefilled (a new signed budget); Cancel this budget holds to
// confirm. A cancelled or ended budget offers a new one instead.
import type { ReactElement } from "react";
import { PARAM, routeHref } from "../../hooks/useRoute";
import { UI } from "../../i18n/ui";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { List, ListRow } from "../../ui/Surface";
import { CancelBudget } from "./CancelBudget";

export interface ConsoleSectionProps {
  readonly active: boolean;
  readonly busy: boolean;
  readonly onCancel: () => void;
}

export function ConsoleSection({ active, busy, onCancel }: ConsoleSectionProps): ReactElement {
  const { t } = useLocale();
  return (
    <section id="budget-console" className="home-block console" aria-labelledby="console-title" tabIndex={-1}>
      <h2 id="console-title" className="home-block__title">{t(UI["console.title"])}</h2>
      <List inset label={t(UI["console.title"])}>
        {active ? (
          <>
            <ListRow href={routeHref("seal", { [PARAM.mode]: "topup" })} leading={<Icon name="plus" />} title={t(UI["console.topUp"])} subtitle={t(UI["console.topUpHint"])} chevron />
            <ListRow href={routeHref("seal", { [PARAM.mode]: "edit" })} leading={<Icon name="settings" />} title={t(UI["console.edit"])} subtitle={t(UI["console.editHint"])} chevron />
          </>
        ) : (
          <ListRow href={routeHref("seal")} leading={<Icon name="lock" />} title={t(UI["home.newBudget"])} subtitle={t(UI["seal.newLog"])} chevron />
        )}
      </List>
      {active ? <CancelBudget disabled={busy} onConfirm={onCancel} /> : null}
    </section>
  );
}
