// "Try asking" (replaces the booth ScenarioPicker): the scenarios as grouped cards, Buy, Stops, Card and Budget. One tap
// runs it and shows Wally at work. Used on the Budget screen and inside the Ask sheet. A person who told Wally their taste
// sees the cards that fit first inside each group, the best fits tagged "For you" (screens/home/tryRank.ts): the same
// cards, the same scenarios, only the order and a tag change.
import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import type { ScenarioId } from "../../api/types";
import { OB } from "../../i18n/onboarding";
import { UI } from "../../i18n/ui";
import { useProfile } from "../../state/useProfile";
import { Tag } from "../../ui/Chip";
import { cx } from "../../ui/cx";
import { nextIndex } from "../../ui/hooks/useRoving";
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
  /**
   * "cards" with a one-line description (Budget); "pills" with the title only (the Ask sheet's shortcuts); "tabs" one group at a time
   * under a row of tabs, every card with its description (the laptop's always-open panel: all of it in reach, none of it a scroll away).
   */
  readonly variant?: "cards" | "pills" | "tabs";
  /** Add Mum's budget (two scenarios) when the booth offers family budgets. Default off. */
  readonly family?: boolean;
}

interface CardsProps {
  readonly group: TryGroup;
  readonly ranked: RankedTry;
  readonly onRun: (id: ScenarioId) => void;
  readonly busy: boolean;
  /** Whether the card carries its one-line description (and the For you tag). */
  readonly described: boolean;
}

function GroupCards({ group, ranked, onRun, busy, described }: CardsProps): ReactElement {
  const { t } = useLocale();
  return (
    <ul className="home-try__grid">
      {ranked.items.filter((s) => s.group === group).map((s) => (
        <li key={s.id}>
          <button type="button" className="home-try__card" data-scenario={s.id} data-for-you={ranked.forYou.has(s.id) || undefined} disabled={busy} onClick={() => onRun(s.id)}>
            <span className={cx("home-try__icon", `home-try__icon--${s.tone}`)}><Icon name={s.icon} size={20} /></span>
            <span className="home-try__title">{t(UI[`home.sc.${s.id}`])}</span>
            {described ? <span className="home-try__desc">{t(UI[`home.sc.${s.id}.d`])}</span> : null}
            {described && ranked.forYou.has(s.id) ? <Tag tone="primary" size="sm" className="home-try__for-you">{t(OB.home.forYou)}</Tag> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Group({ group, ranked, onRun, busy, headingLevel, variant }: { readonly group: TryGroup; readonly ranked: RankedTry; readonly onRun: (id: ScenarioId) => void; readonly busy: boolean; readonly headingLevel: 2 | 3; readonly variant: "cards" | "pills" }): ReactElement {
  const { t } = useLocale();
  const id = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="home-try__group" role="group" aria-labelledby={id}>
      <Heading id={id} className="home-try__group-title">{t(UI[`home.group.${group}`])}</Heading>
      <GroupCards group={group} ranked={ranked} onRun={onRun} busy={busy} described={variant === "cards"} />
    </div>
  );
}

/** One group at a time under a row of tabs (arrows, Home and End move between them). The first group shows first. */
function Tabbed({ groups, ranked, onRun, busy }: { readonly groups: readonly TryGroup[]; readonly ranked: RankedTry; readonly onRun: (id: ScenarioId) => void; readonly busy: boolean }): ReactElement {
  const { t } = useLocale();
  const base = useId();
  const list = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<TryGroup>(groups[0] ?? "buy");
  // Mum's budget can leave the list (a booth without family budgets): fall back to the first group rather than show nothing.
  const shown = groups.includes(current) ? current : (groups[0] ?? "buy");
  const index = Math.max(0, groups.indexOf(shown));
  const onKey = (e: KeyboardEvent<HTMLButtonElement>): void => {
    const next = nextIndex(e.key, index, groups.length);
    const group = next === null ? undefined : groups[next];
    if (group === undefined) return;
    e.preventDefault();
    setCurrent(group);
    list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next ?? 0]?.focus();
  };
  return (
    <>
      <div className="home-try__tabs" role="tablist" aria-label={t(UI["home.groups"])} ref={list}>
        {groups.map((g) => (
          <button key={g} type="button" role="tab" id={`${base}-tab-${g}`} aria-controls={`${base}-panel`} aria-selected={g === shown} tabIndex={g === shown ? 0 : -1} className="home-try__tab" data-group={g} onClick={() => setCurrent(g)} onKeyDown={onKey}>
            {t(UI[`home.group.${g}`])}
          </button>
        ))}
      </div>
      <div key={shown} role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${shown}`} className="home-try__panel">
        <GroupCards group={shown} ranked={ranked} onRun={onRun} busy={busy} described />
      </div>
    </>
  );
}

export function TryAsking({ onRun, busy, headingLevel = 3, variant = "cards", family = false }: TryAskingProps): ReactElement {
  const { profile } = useProfile();
  const ranked = useMemo(() => rankTryItems(TRY_ITEMS, profile), [profile]);
  const groups = family ? [...TRY_GROUPS, FAMILY_GROUP] : TRY_GROUPS;
  return (
    <div className={cx("home-try", `home-try--${variant}`)}>
      {variant === "tabs" ? (
        <Tabbed groups={groups} ranked={ranked} onRun={onRun} busy={busy} />
      ) : (
        groups.map((g) => <Group key={g} group={g} ranked={ranked} onRun={onRun} busy={busy} headingLevel={headingLevel} variant={variant} />)
      )}
    </div>
  );
}
