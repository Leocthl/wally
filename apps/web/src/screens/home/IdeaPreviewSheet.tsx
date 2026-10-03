// The look at an idea before anything is bought: its drawing, name, shop and price (SIMULATED, from the demo shop), and two
// buttons. Only "Ask Wally to buy this" starts the purchase; "Not now", the close button, Escape and a tap outside all leave
// it as it was. The booth's scenario cards do not come through here: they are controls and keep running at once.
import { useRef, type ReactElement } from "react";
import { SIMULATED } from "../../domain/provenance";
import { OB } from "../../i18n/onboarding";
import { UI } from "../../i18n/ui";
import { Button } from "../../ui/Button";
import { Tag } from "../../ui/Chip";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { Sheet } from "../../ui/Overlay";
import { Fill, Money, ScopeChip } from "../../shell/figures";
import { IdeaArt } from "./IdeaArt";
import { ideaListing } from "./ideaListings";
import type { Idea } from "./ideas";
import "./ideaSheet.css";

export interface IdeaPreviewSheetProps {
  /** The idea being looked at; null closes the sheet. */
  readonly idea: Idea | null;
  /** A run is in flight: the buy button waits, so nothing is sent twice. */
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onBuy: (idea: Idea) => void;
}

export function IdeaPreviewSheet({ idea, busy, onClose, onBuy }: IdeaPreviewSheetProps): ReactElement | null {
  const { t } = useLocale();
  // The sheet leaves with a short animation: keep what it shows until it is gone.
  const last = useRef<Idea | null>(idea);
  if (idea !== null) last.current = idea;
  const shown = last.current;
  if (shown === null) return null;
  const listing = ideaListing(shown.id);
  return (
    <Sheet
      open={idea !== null}
      onClose={onClose}
      title={t(shown.title)}
      footer={
        <>
          <Button size="lg" block disabled={busy} icon={<Icon name="chat" size={20} />} onClick={() => onBuy(shown)} data-idea-buy>{t(OB.ideas.buy)}</Button>
          <Button variant="ghost" block onClick={onClose} data-idea-later>{t(UI["shell.notNow"])}</Button>
        </>
      }
    >
      <div className="idea-sheet" data-idea-sheet={shown.id}>
        <div className="idea-sheet__art"><IdeaArt id={shown.id} size={136} /></div>
        {listing === null ? null : (
          <div className="idea-sheet__facts" data-chip-scope>
            <p className="idea-sheet__price"><Money minor={listing.totalMinor} prov={SIMULATED} /></p>
            <ScopeChip prov={SIMULATED} className="idea-sheet__chip" />
            {listing.shippingMinor > 0 ? (
              <p className="idea-sheet__sub">
                <Fill text={t(OB.ideas.shipping)} slots={{ price: <Money minor={listing.priceMinor} prov={SIMULATED} />, shipping: <Money minor={listing.shippingMinor} prov={SIMULATED} /> }} />
              </p>
            ) : null}
            <p className="idea-sheet__shop">
              <span className="idea-sheet__shopname" data-ident>{listing.shop}</span>
              <Tag size="sm" icon={<Icon name="store" size={14} />}>{t(OB.ideas.from)}</Tag>
            </p>
          </div>
        )}
        <p className="idea-sheet__note">{t(OB.ideas.checks)}</p>
      </div>
    </Sheet>
  );
}
