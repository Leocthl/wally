// "Similar in the shop": up to four simulated items, each a drawn picture in the item's colours, a name built from its typed
// words, the shop, the price with its SIMULATED chip, a budget badge and why it is on the list. The cards are a radio group:
// one tap picks, and the sheet's footer then offers "Ask Wally to buy this". The badge is information, never a filter: an item
// that costs more than is left stays on the list, and the rules decide.
import { useRef, type KeyboardEvent, type ReactElement } from "react";
import { fitsBudget } from "@wally/agent/vision";
import type { ShopMatch } from "../../api/types";
import { ChipScope } from "../../components/ChipScope";
import { Num } from "../../components/Num";
import { SIMULATED } from "../../domain/provenance";
import { itemName, PHOTO, reasonLine } from "../../i18n/photo";
import { cx } from "../../ui/cx";
import { nextIndex } from "../../ui/hooks/useRoving";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { Tag } from "../../ui/Chip";
import { GarmentArt } from "./GarmentArt";

/** "Demo Outlet (SIMULATED)" is shown as "Demo Outlet": the SIMULATED chip sits on the price. */
export const shopName = (merchantName: string): string => merchantName.replace(/\s*\(SIMULATED\)\s*$/, "");

function Card({ match, picked, tabIndex, remainingMinor, onPick, onKeyDown }: { readonly match: ShopMatch; readonly picked: boolean; readonly tabIndex: number; readonly remainingMinor: number | null; readonly onPick: () => void; readonly onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void }): ReactElement {
  const { t, locale } = useLocale();
  const name = itemName(locale, match);
  const fits = fitsBudget(match.totalMinor, remainingMinor);
  const nameId = `photo-card-${match.listingId}`;
  return (
    <>
      <button type="button" role="radio" aria-checked={picked} aria-labelledby={nameId} aria-describedby={`${nameId}-more`} tabIndex={tabIndex} className={cx("photo-card", picked && "photo-card--picked")} data-listing={match.listingId} onClick={onPick} onKeyDown={onKeyDown}>
        <span className="photo-card__art" aria-hidden="true">
          <GarmentArt kind={match.kind} colors={match.colors} pattern={match.pattern} size={104} />
        </span>
        <span className="photo-card__name" id={nameId}>{name}</span>
        <span id={`${nameId}-more`} className="photo-card__more">
          <span className="photo-card__shop">{shopName(match.merchantName)}</span>
          <ChipScope as="span" provs={[SIMULATED]} className="photo-card__price" chipsClassName="photo-card__chip">
            <Num kind="money" value={match.priceMinor} prov={SIMULATED} chip="scope" className="photo-card__amount" />
            {match.totalMinor !== match.priceMinor ? <span className="photo-card__ship">{t(PHOTO.plusShipping)}</span> : null}
          </ChipScope>
          {fits === null ? null : fits ? (
            <Tag tone="ok" size="sm" icon={<Icon name="check" size={12} strokeWidth={2.6} />}>{t(PHOTO.fitsBudget)}</Tag>
          ) : (
            <Tag tone="warn" size="sm" icon={<Icon name="info" size={12} />}>{t(PHOTO.overBudget)}</Tag>
          )}
          <span className="photo-card__reason">{reasonLine(locale, match.reasons)}</span>
        </span>
        {picked ? (
          <span className="photo-card__picked" aria-hidden="true">
            <Icon name="check" size={16} strokeWidth={3} />
          </span>
        ) : null}
      </button>
    </>
  );
}

export interface MatchCardsProps {
  readonly matches: readonly ShopMatch[];
  readonly pickedId: string | null;
  readonly onPick: (listingId: string) => void;
  /** What is left of the budget, for the badge; null when not known. */
  readonly remainingMinor: number | null;
  readonly refreshing: boolean;
  /** The id of the heading that names the list. */
  readonly labelledBy: string;
}

export function MatchCards({ matches, pickedId, onPick, remainingMinor, refreshing, labelledBy }: MatchCardsProps): ReactElement {
  const list = useRef<HTMLDivElement>(null);
  const index = Math.max(0, matches.findIndex((m) => m.listingId === pickedId));
  const onKey = (at: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const next = nextIndex(e.key, at, matches.length, "both");
    const match = next === null ? undefined : matches[next];
    if (!match) return;
    e.preventDefault();
    onPick(match.listingId);
    list.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next ?? 0]?.focus();
  };
  return (
    <div ref={list} className="photo-matches" role="radiogroup" aria-labelledby={labelledBy} aria-busy={refreshing} data-refreshing={refreshing || undefined}>
      {matches.map((match, i) => (
        <Card key={match.listingId} match={match} picked={match.listingId === pickedId} tabIndex={i === index ? 0 : -1} remainingMinor={remainingMinor} onPick={() => onPick(match.listingId)} onKeyDown={onKey(i)} />
      ))}
    </div>
  );
}
