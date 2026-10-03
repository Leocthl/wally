// "Try asking" (replaces the booth ScenarioPicker): the scenarios as grouped cards, Buy, Stops, Card and Budget. One tap
// runs it and shows Wally at work. Used on the Budget screen and inside the Ask sheet. A person who told Wally their taste
// sees the cards that fit first inside each group, the best fits tagged "For you" (screens/home/tryRank.ts): the same
// cards, the same scenarios, only the order and a tag change.
import { useId, useMemo, type ReactElement } from "react";
import type { ScenarioId } from "../../api/types";
import { OB } from "../../i18n/onboarding";
import { UI } from "../../i18n/ui";
import { useProfile } from "../../state/useProfile";
import { Tag } from "../../ui/Chip";
import { cx } from "../../ui/cx";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { FAMILY_GROUP, TRY_GROUPS, TRY_ITEMS, type TryGroup } from "./tryCatalog";
import { rankTryItems, type RankedTry } from "./tryRank";

export interface TryAskingProps {
  readonly onRun: (id: ScenarioId) => void;
  /** A run is in flight: cards wait, so nothing is sent twice. */
  readonly busy: boolean;
  /** Heading level for the group titles (3 on Budget under "Try asking", 3 in the sheet). */
  readonly headingLevel?: 2 | 3;
  /** "cards" with a one-line description (Budget); "pills" with the title only (the Ask sheet's shortcuts). */
  readonly variant?: "cards" | "pills";
  /** Add Mum's budget (two scenarios) when the booth offers family budgets. Default off. */
  readonly family?: boolean;
}

function Group({ group, ranked, onRun, busy, headingLevel, variant }: { readonly group: TryGroup; readonly ranked: RankedTry } & Required<Omit<TryAskingProps, "family">>): ReactElement {
  const { t } = useLocale();
  const id = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="home-try__group" role="group" aria-labelledby={id}>
      <Heading id={id} className="home-try__group-title">{t(UI[`home.group.${group}`])}</Heading>
      <ul className="home-try__grid">
        {ranked.items.filter((s) => s.group === group).map((s) => (
          <li key={s.id}>
            <button type="button" className="home-try__card" data-scenario={s.id} data-for-you={ranked.forYou.has(s.id) || undefined} disabled={busy} onClick={() => onRun(s.id)}>
              <span className={cx("home-try__icon", `home-try__icon--${s.tone}`)}><Icon name={s.icon} size={20} /></span>
              <span className="home-try__title">{t(UI[`home.sc.${s.id}`])}</span>
              {variant === "cards" ? <span className="home-try__desc">{t(UI[`home.sc.${s.id}.d`])}</span> : null}
              {variant === "cards" && ranked.forYou.has(s.id) ? <Tag tone="primary" size="sm" icon={<Icon name="sparkle" size={12} />} className="home-try__for-you">{t(OB.home.forYou)}</Tag> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TryAsking({ onRun, busy, headingLevel = 3, variant = "cards", family = false }: TryAskingProps): ReactElement {
  const { profile } = useProfile();
  const ranked = useMemo(() => rankTryItems(TRY_ITEMS, profile), [profile]);
  return (
    <div className={cx("home-try", `home-try--${variant}`)}>
      {(family ? [...TRY_GROUPS, FAMILY_GROUP] : TRY_GROUPS).map((g) => (
        <Group key={g} group={g} ranked={ranked} onRun={onRun} busy={busy} headingLevel={headingLevel} variant={variant} />
      ))}
    </div>
  );
}
