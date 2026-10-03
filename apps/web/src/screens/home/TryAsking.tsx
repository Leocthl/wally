// "Try asking" (replaces the booth ScenarioPicker): the scenarios as grouped cards, Buy, Stops, Card and Budget. One tap
// runs it and shows Wally at work. Used on the Budget screen and inside the Ask sheet. A person who narrowed what they shop
// for sees the cards that fit first inside each group, the best fits tagged "For you" (screens/home/tryRank.ts): the same
// cards, the same scenarios, only the order and a tag change.
import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import type { ScenarioId } from "../../api/types";
import type { LabelPair } from "../../i18n/label";
import { OB } from "../../i18n/onboarding";
import { UI } from "../../i18n/ui";
import { useProfile } from "../../state/useProfile";
import { Tag } from "../../ui/Chip";
import { cx } from "../../ui/cx";
import { nextIndex } from "../../ui/hooks/useRoving";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { readDemoTab, rememberDemoTab } from "./demoMode";
import { FAMILY_GROUP, TRY_GROUPS, TRY_ITEMS, type TryGroup, type TryScenario } from "./tryCatalog";
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
  /**
   * The categories the budget names, when there is one. The earbuds card says "Not something your rules allow" only where electronics
   * are not among them; on a budget that names electronics it says what really happens instead. Without it the card keeps its first words.
   */
  readonly budgetCategories?: readonly string[] | undefined;
}

interface CardsProps {
  readonly group: TryGroup;
  readonly ranked: RankedTry;
  readonly onRun: (id: ScenarioId) => void;
  readonly busy: boolean;
  /** Whether the card carries its one-line description (and the For you tag). */
  readonly described: boolean;
  /** The budget names electronics: the earbuds card is not an off-category stop there. */
  readonly electronics: boolean;
}

/** A card's title and one-line description. The earbuds card is the off-category stop, except on a budget that allows electronics. */
function wordsOf(id: TryScenario, electronics: boolean): { readonly title: LabelPair; readonly desc: LabelPair } {
  if (id === "off_category" && electronics) return { title: UI["home.sc.off_category.allowed"], desc: UI["home.sc.off_category.allowed.d"] };
  return { title: UI[`home.sc.${id}`], desc: UI[`home.sc.${id}.d`] };
}

function GroupCards({ group, ranked, onRun, busy, described, electronics }: CardsProps): ReactElement {
  const { t } = useLocale();
  return (
    <ul className="home-try__grid">
      {ranked.items.filter((s) => s.group === group).map((s) => {
        const words = wordsOf(s.id, electronics);
        return (
          <li key={s.id}>
            <button type="button" className="home-try__card" data-scenario={s.id} data-for-you={ranked.forYou.has(s.id) || undefined} disabled={busy} onClick={() => onRun(s.id)}>
              <span className={cx("home-try__icon", `home-try__icon--${s.tone}`)}><Icon name={s.icon} size={20} /></span>
              <span className="home-try__title">{t(words.title)}</span>
              {described ? <span className="home-try__desc">{t(words.desc)}</span> : null}
              {described && ranked.forYou.has(s.id) ? <Tag tone="primary" size="sm" className="home-try__for-you">{t(OB.home.forYou)}</Tag> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Group({ group, ranked, onRun, busy, headingLevel, variant, electronics }: { readonly group: TryGroup; readonly ranked: RankedTry; readonly onRun: (id: ScenarioId) => void; readonly busy: boolean; readonly headingLevel: 2 | 3; readonly variant: "cards" | "pills"; readonly electronics: boolean }): ReactElement {
  const { t } = useLocale();
  const id = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="home-try__group" role="group" aria-labelledby={id}>
      <Heading id={id} className="home-try__group-title">{t(UI[`home.group.${group}`])}</Heading>
      <GroupCards group={group} ranked={ranked} onRun={onRun} busy={busy} described={variant === "cards"} electronics={electronics} />
    </div>
  );
}

/** One group at a time under a row of tabs (arrows, Home and End move between them). The first group shows first. */
function Tabbed({ groups, ranked, onRun, busy, electronics }: { readonly groups: readonly TryGroup[]; readonly ranked: RankedTry; readonly onRun: (id: ScenarioId) => void; readonly busy: boolean; readonly electronics: boolean }): ReactElement {
  const { t } = useLocale();
  const base = useId();
  const list = useRef<HTMLDivElement>(null);
  // The tab chosen last in this session comes back, so running the second stop is one click, not two.
  const [current, setCurrentState] = useState<TryGroup>(() => groups.find((g) => g === readDemoTab()) ?? groups[0] ?? "buy");
  const setCurrent = (group: TryGroup): void => {
    rememberDemoTab(group);
    setCurrentState(group);
  };
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
        <GroupCards group={shown} ranked={ranked} onRun={onRun} busy={busy} described electronics={electronics} />
      </div>
    </>
  );
}

export function TryAsking({ onRun, busy, headingLevel = 3, variant = "cards", family = false, budgetCategories }: TryAskingProps): ReactElement {
  const { profile } = useProfile();
  const ranked = useMemo(() => rankTryItems(TRY_ITEMS, profile), [profile]);
  const groups = family ? [...TRY_GROUPS, FAMILY_GROUP] : TRY_GROUPS;
  const electronics = budgetCategories?.includes("electronics") === true;
  return (
    <div className={cx("home-try", `home-try--${variant}`)}>
      {variant === "tabs" ? (
        <Tabbed groups={groups} ranked={ranked} onRun={onRun} busy={busy} electronics={electronics} />
      ) : (
        groups.map((g) => <Group key={g} group={g} ranked={ranked} onRun={onRun} busy={busy} headingLevel={headingLevel} variant={variant} electronics={electronics} />)
      )}
    </div>
  );
}
