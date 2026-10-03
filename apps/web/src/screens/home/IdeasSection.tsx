// "Ideas for you": three or four real shelf items, led by the person's taste. One tap asks Wally for that item, exactly as if
// the person had typed it (a booth that cannot take a typed ask runs the same item's booth scenario instead). Nothing is
// bought by the card: the rules decide, and the result is on Wally's screen.
import { useId, useMemo, type ReactElement } from "react";
import { OB } from "../../i18n/onboarding";
import { useProfile } from "../../state/useProfile";
import { SHOP_IDS, type ShopId } from "../../state/taste";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { categoryName } from "./BudgetHero";
import { ideasFor, type Idea, type IdeaReason } from "./ideas";

export interface IdeasProps {
  readonly onAsk: (idea: Idea) => void;
  /** A run is in flight: the cards wait, so nothing is sent twice. */
  readonly busy: boolean;
}

const isShop = (reason: IdeaReason): reason is ShopId => reason !== null && (SHOP_IDS as readonly string[]).includes(reason);

export function Ideas({ onAsk, busy }: IdeasProps): ReactElement {
  const { t } = useLocale();
  const { profile } = useProfile();
  const shown = useMemo(() => ideasFor(profile), [profile]);
  const heading = useId();
  return (
    <section className="home-block" aria-labelledby={heading} data-tour="ideas">
      <h2 id={heading} className="home-block__title">{t(OB.ideas.title)}</h2>
      <ul className="home-try__grid home-ideas">
        {shown.map(({ idea, reason }) => (
          <li key={idea.id}>
            <button type="button" className="home-try__card home-idea" data-idea={idea.id} data-idea-reason={reason ?? undefined} disabled={busy} onClick={() => onAsk(idea)}>
              <span className="home-try__icon home-try__icon--primary"><Icon name={idea.icon} size={20} /></span>
              <span className="home-try__title">{t(idea.title)}</span>
              <span className="home-try__desc home-idea__why">{reason === null ? t(idea.kind) : isShop(reason) ? categoryName(reason, t) : t(OB.taste.style[reason])}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
