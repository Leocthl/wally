// The buy bar at the foot of the photo sheet: what Wally would be asked to buy, the amount of the one-off card, the sentence about
// the rules, and the Buy button. At large text the words can be taller than the room the sheet leaves them: they scroll in their
// own region (a tab stop, with a shade at the cut edge, only while they do) and the button under them stays on the screen.
import { useRef, type ReactElement } from "react";
import type { ShopMatch } from "../../api/types";
import { Num } from "../../components/Num";
import { SIMULATED } from "../../domain/provenance";
import { itemName, PHOTO } from "../../i18n/photo";
import { Button } from "../../ui/Button";
import { useOverflows } from "../../ui/hooks/useOverflows";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { shopName } from "./MatchCards";

export interface BuyBarProps {
  readonly match: ShopMatch;
  /** The booth is busy with another purchase: the button waits. */
  readonly busy: boolean;
  readonly onBuy: () => void;
}

export function BuyBar({ match, busy, onBuy }: BuyBarProps): ReactElement {
  const { t, locale } = useLocale();
  const words = useRef<HTMLDivElement>(null);
  const scrolls = useOverflows(words);
  return (
    <div className="photo-buy" data-slot="photo-buy">
      <div className="photo-buy__stack">
        <div ref={words} className="photo-buy__text" data-slot="photo-buy-text" data-scrolls={scrolls || undefined} tabIndex={scrolls ? 0 : undefined}>
          <p className="photo-buy__line">
            {t(PHOTO.buyNamed(itemName(locale, match)))} <span className="photo-buy__shop">{shopName(match.merchantName)}</span>
          </p>
          <p className="photo-buy__note">
            {t(PHOTO.cardFor)} <Num kind="money" value={match.totalMinor} prov={SIMULATED} /> {t(PHOTO.buyNote)}
          </p>
        </div>
        <Button size="lg" block icon={<Icon name="chat" size={20} />} disabled={busy} data-slot="photo-buy-button" onClick={onBuy}>
          {t(PHOTO.buy)}
        </Button>
      </div>
    </div>
  );
}
