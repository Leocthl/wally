// "Wally can shop for": the kinds of item the demo shop has, as chips under the Ask question, with "Show Wally a photo"
// first. A tap is the same as typing that word: the fixed keyword reader finds the items and the shopper picks one. Nothing
// here decides a purchase.
import { useId, type ReactElement } from "react";
import { SHOP_KINDS } from "@wally/agent/vision";
import { KIND_WORDS, PHOTO } from "../../i18n/photo";
import { useLocale } from "../../ui/locale";
import { PhotoPill } from "./PhotoEntry";

export interface ShopChipsProps {
  /** Looks for this word in the demo shop (what typing it would do). */
  readonly onPick: (word: string) => void;
  /** Hands a chosen picture to the photo sheet; the chip is left out where the booth cannot read pictures. */
  readonly onPhoto?: ((file: File) => void) | undefined;
  readonly busy: boolean;
}

export function ShopChips({ onPick, onPhoto, busy }: ShopChipsProps): ReactElement {
  const { t } = useLocale();
  const heading = useId();
  return (
    <section className="shop-chips" aria-labelledby={heading} data-slot="shop-chips">
      <h3 id={heading} className="shop-chips__title">{t(PHOTO.canShop)}</h3>
      <div className="shop-chips__row">
        {onPhoto ? <PhotoPill onFile={onPhoto} busy={busy} /> : null}
        {SHOP_KINDS.map((kind) => (
          <button key={kind} type="button" className="shop-chip" data-kind={kind} disabled={busy} onClick={() => onPick(t(KIND_WORDS[kind]))}>
            {t(KIND_WORDS[kind])}
          </button>
        ))}
      </div>
    </section>
  );
}
