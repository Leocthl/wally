// "Ideas for you": four real shelf items, led by the categories the person chose, each with its price. A tap opens a preview (the
// drawing, the shop, the price in HK$ with its SIMULATED chip); only "Ask Wally to buy this" there asks Wally for the item,
// exactly as if the person had typed it (a booth that cannot take a typed ask runs the same item's booth scenario instead).
// Nothing is bought by the card: the rules decide, and the result is on Wally's screen.
import { useId, useMemo, useState, type ReactElement } from "react";
import { SIMULATED } from "../../domain/provenance";
import { OB } from "../../i18n/onboarding";
import { useProfile } from "../../state/useProfile";
import { useLocale } from "../../ui/locale";
import { Money } from "../../shell/figures";
import { categoryName } from "./BudgetHero";
import { IdeaArt } from "./IdeaArt";
import { IdeaPreviewSheet } from "./IdeaPreviewSheet";
import { ideaListing } from "./ideaListings";
import { ideasFor, type Idea } from "./ideas";

export interface IdeasProps {
  /** Asks Wally for the idea's item. Called only from the preview's buy button. */
  readonly onAsk: (idea: Idea) => void;
  /** A run is in flight: the cards wait, so nothing is sent twice. */
  readonly busy: boolean;
}

export function Ideas({ onAsk, busy }: IdeasProps): ReactElement {
  const { t } = useLocale();
  const { profile } = useProfile();
  const shown = useMemo(() => ideasFor(profile), [profile]);
  const heading = useId();
  const [preview, setPreview] = useState<Idea | null>(null);
  const buy = (idea: Idea): void => {
    setPreview(null);
    onAsk(idea);
  };
  return (
    <section className="home-block" aria-labelledby={heading} data-tour="ideas">
      <h2 id={heading} className="home-block__title">{t(OB.ideas.title)}</h2>
      <ul className="home-try__grid home-ideas">
        {shown.map(({ idea, reason }) => {
          const listing = ideaListing(idea.id);
          return (
            <li key={idea.id}>
              <button type="button" className="home-try__card home-idea" data-idea={idea.id} data-idea-reason={reason ?? undefined} aria-haspopup="dialog" disabled={busy} onClick={() => setPreview(idea)}>
                <IdeaArt id={idea.id} size={64} className="home-idea__art" />
                <span className="home-try__title">{t(idea.title)}</span>
                <span className="home-try__desc home-idea__why">{reason === null ? t(idea.kind) : categoryName(reason, t)}</span>
                {listing === null ? null : <Money minor={listing.totalMinor} prov={SIMULATED} className="home-idea__price" />}
              </button>
            </li>
          );
        })}
      </ul>
      <IdeaPreviewSheet idea={preview} busy={busy} onClose={() => setPreview(null)} onBuy={buy} />
    </section>
  );
}
