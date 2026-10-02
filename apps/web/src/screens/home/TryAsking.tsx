// "Try asking" (replaces the booth ScenarioPicker): the scenarios as grouped cards, Buy, Stops, Card and Budget. One tap
// runs it and shows Wally at work. Used on the Budget screen and inside the Ask sheet.
import { useId, type ReactElement } from "react";
import type { ScenarioId } from "../../api/types";
import { UI } from "../../i18n/ui";
import { cx } from "../../ui/cx";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { TRY_GROUPS, TRY_ITEMS, type TryGroup } from "./tryCatalog";

export interface TryAskingProps {
  readonly onRun: (id: ScenarioId) => void;
  /** A run is in flight: cards wait, so nothing is sent twice. */
  readonly busy: boolean;
  /** Heading level for the group titles (3 on Budget under "Try asking", 3 in the sheet). */
  readonly headingLevel?: 2 | 3;
}

function Group({ group, onRun, busy, headingLevel }: { readonly group: TryGroup } & Required<TryAskingProps>): ReactElement {
  const { t } = useLocale();
  const id = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="home-try__group" role="group" aria-labelledby={id}>
      <Heading id={id} className="home-try__group-title">{t(UI[`home.group.${group}`])}</Heading>
      <ul className="home-try__grid">
        {TRY_ITEMS.filter((s) => s.group === group).map((s) => (
          <li key={s.id}>
            <button type="button" className="home-try__card" data-scenario={s.id} disabled={busy} onClick={() => onRun(s.id)}>
              <span className={cx("home-try__icon", `home-try__icon--${s.tone}`)}><Icon name={s.icon} size={20} /></span>
              <span className="home-try__title">{t(UI[`home.sc.${s.id}`])}</span>
              <span className="home-try__desc">{t(UI[`home.sc.${s.id}.d`])}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TryAsking({ onRun, busy, headingLevel = 3 }: TryAskingProps): ReactElement {
  return (
    <div className="home-try">
      {TRY_GROUPS.map((g) => (
        <Group key={g} group={g} onRun={onRun} busy={busy} headingLevel={headingLevel} />
      ))}
    </div>
  );
}
