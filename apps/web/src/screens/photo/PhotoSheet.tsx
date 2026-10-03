// "Show Wally a photo", and the same sheet for the shopper's own words: Wally looks (the booth's model when it has one, else
// the colours of the picture, or the fixed keyword reader for words), says what it looks for as chips the shopper can
// change, and lists four similar items from the simulated shop. The shopper picks one and asks Wally to buy it: from there
// the normal pipeline decides (planner proposal fixed by code, judge, rules R1 to R12, a one-off card, or Stopped before
// paying). A picture stays on this page and is never saved. Loaded as its own chunk the first time it is needed.
import { useEffect, useId, useMemo, useRef, useState, type ReactElement, type RefObject } from "react";
import { colorSwatch } from "@wally/agent/vision";
import { useBoothContext } from "../../hooks/useBooth";
import { COLOR_WORDS, FIT_WORDS, KIND_WORDS, PATTERN_WORDS, PHOTO, seesPhrase, STYLE_WORDS } from "../../i18n/photo";
import { cx } from "../../ui/cx";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { Sheet } from "../../ui/Overlay";
import { BuyBar } from "./BuyBar";
import { MatchCards } from "./MatchCards";
import { ChipGroup, PaletteDots } from "./PhotoChips";
import { Announce, LimitRow, Looking, LookupFailed, Notice, Problem, useAfter, type Flow } from "./PhotoStates";
import { chosenKind, COLOR_CHOICES, FIT_CHOICES, KIND_CHOICES, PATTERN_CHOICES, STYLE_CHOICES } from "./photoModel";
import { usePhotoBuy } from "./usePhotoBuy";
import { usePhotoFlow, type PhotoSource } from "./usePhotoFlow";
import "./photo.css";

export interface PhotoSheetProps {
  /** What the shopper chose (a picture) or typed (words); null closes the sheet. */
  readonly source: PhotoSource | null;
  readonly onClose: () => void;
  /** "Choose another picture": hands a new file to the shell. */
  readonly onPickFile: (file: File) => void;
}

/** Words are read in a blink: Wally's "looking" panel only appears if it takes longer than this, so it never flashes. */
const WORDS_LOOKING_DELAY_MS = 250;

/** The type of item: one of the kinds the shop has. Attention while none is chosen. */
function KindChips({ flow }: { readonly flow: Flow }): ReactElement {
  const { t } = useLocale();
  const kind = chosenKind(flow.attributes);
  const kinds = useMemo(() => KIND_CHOICES.map((id) => ({ id, text: t(KIND_WORDS[id]) })), [t]);
  return <ChipGroup slot="photo-kind" title={kind === null ? t(PHOTO.typePick) : t(PHOTO.typeGroup)} mode="choose" attention={kind === null} options={kinds} selected={kind === null ? [] : [kind]} onPick={flow.setKind} />;
}

/** Colours, pattern, fit and style: the details that sharpen the list. */
function DetailChips({ flow }: { readonly flow: Flow }): ReactElement {
  const { t } = useLocale();
  const { attributes } = flow;
  const colors = useMemo(() => COLOR_CHOICES.map((id) => ({ id, text: t(COLOR_WORDS[id]), swatch: colorSwatch(id) })), [t]);
  return (
    <>
      <ChipGroup slot="photo-colors" title={t(PHOTO.colorGroup)} mode="toggle" options={colors} selected={attributes.colors} onPick={flow.toggleColor} />
      <ChipGroup slot="photo-pattern" title={t(PHOTO.patternGroup)} mode="toggle" options={PATTERN_CHOICES.map((id) => ({ id, text: t(PATTERN_WORDS[id]) }))} selected={attributes.pattern === null ? [] : [attributes.pattern]} onPick={flow.setPattern} />
      <ChipGroup slot="photo-fit" title={t(PHOTO.fitGroup)} mode="toggle" options={FIT_CHOICES.map((id) => ({ id, text: t(FIT_WORDS[id]) }))} selected={attributes.fit === null || attributes.fit === "unknown" ? [] : [attributes.fit]} onPick={flow.setFit} />
      <ChipGroup slot="photo-style" title={t(PHOTO.styleGroup)} mode="toggle" options={STYLE_CHOICES.map((id) => ({ id, text: t(STYLE_WORDS[id]) }))} selected={attributes.style} onPick={flow.toggleStyle} />
    </>
  );
}

/** What the list says when it is empty: no type yet, a type the shop does not have, or nothing that cheap. */
function emptyText(flow: Flow, known: boolean): typeof PHOTO.noKindYet {
  if (!known) return PHOTO.noKindYet;
  return flow.maxPriceMinor !== null ? PHOTO.noneUnderLimit : PHOTO.noMatch;
}

function Ready({ flow, remainingMinor }: { readonly flow: Flow; readonly remainingMinor: number | null }): ReactElement {
  const { t, locale } = useLocale();
  const heading = useId();
  const { attributes, matches } = flow;
  const words = flow.mode === "words";
  const known = attributes.kind !== null && attributes.kind !== "not_clothing";
  // Decided once, when the answer arrives: with no type yet, the type chips come first (the list cannot show anything until one is
  // chosen); with a type, the list comes first and every chip waits under "Change what Wally looks for". It never moves under a finger.
  const [typeFirst] = useState(() => chosenKind(attributes) === null);
  const phrase = seesPhrase(locale, attributes);
  // Wally's own reading says "Wally sees"; once the shopper has changed a chip, or when the words were theirs, it is what Wally looks for.
  const label = !known ? t(words ? PHOTO.whichKind : PHOTO.seesNothingYet) : t(flow.mode === "model" && !flow.edited ? PHOTO.sees(phrase) : PHOTO.lookingFor(phrase));
  return (
    <div className="photo" data-slot="photo-ready" data-source={words ? "words" : "picture"}>
      <section className={cx("photo-seen", flow.pictureUrl === null && "photo-seen--bare")}>
        {flow.pictureUrl !== null ? <img className="photo-seen__img" src={flow.pictureUrl} alt={t(PHOTO.yourPicture)} /> : null}
        <div className="photo-seen__text">
          <p className="photo-seen__label" data-slot="photo-sees">{label}</p>
          {flow.palette.length > 0 && !words ? <PaletteDots palette={flow.palette} selected={attributes.colors} onToggle={flow.toggleColor} title={t(PHOTO.fromPlates)} /> : null}
        </div>
      </section>
      <Notice notice={flow.notice} />
      {typeFirst ? <KindChips flow={flow} /> : null}
      <LimitRow flow={flow} />
      <section aria-labelledby={heading} className="photo-shop" data-slot="photo-shop">
        <h3 id={heading} className="photo-shop__title">{t(PHOTO.similar)}</h3>
        <LookupFailed flow={flow} />
        {matches.length > 0 ? (
          <MatchCards matches={matches} pickedId={flow.pickedId} onPick={flow.pick} remainingMinor={remainingMinor} refreshing={flow.refreshing} labelledBy={heading} />
        ) : (
          <p className="photo-shop__empty" role="status">{t(emptyText(flow, known))}</p>
        )}
        <p className="photo-shop__note">{t(PHOTO.shopNote)}</p>
      </section>
      <details className="photo-more" data-slot="photo-change">
        <summary>{t(PHOTO.changeGroup)}</summary>
        <div className="photo-more__body">
          {typeFirst ? null : <KindChips flow={flow} />}
          <DetailChips flow={flow} />
        </div>
      </details>
      {words ? null : (
        <p className="photo-privacy" data-slot="photo-privacy">
          <Icon name="lock" size={16} />
          <span>{flow.mode === "model" ? t(PHOTO.privacyModel) : t(PHOTO.privacyDevice)}</span>
        </p>
      )}
    </div>
  );
}

/** When the screen under the sheet changes (Wally looked, a problem came), keep focus inside the sheet instead of dropping it on the page. */
function useKeepFocus(phaseName: string): RefObject<HTMLDivElement | null> {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = body.current;
    if (el === null) return;
    const dialog = el.closest('[role="dialog"]');
    const at = document.activeElement;
    const adrift = at === null || at === document.body || !(dialog?.contains(at) ?? false);
    if (adrift || phaseName === "error") el.focus({ preventScroll: true });
  }, [phaseName]);
  return body;
}

export default function PhotoSheet({ source, onClose, onPickFile }: PhotoSheetProps): ReactElement {
  const { t } = useLocale();
  const { api, info, state, busy } = useBoothContext();
  const flow = usePhotoFlow(source, { api, mode: info?.features?.see === "model" ? "model" : "palette" });
  const buy = usePhotoBuy();
  const remainingMinor = state.packet?.remaining_minor ?? null;
  const picked = flow.matches.find((m) => m.listingId === flow.pickedId) ?? null;
  const { phase } = flow;
  const words = flow.mode === "words";
  const looking = phase.name === "idle" || phase.name === "preparing" || phase.name === "looking";
  const showLooking = useAfter(words ? WORDS_LOOKING_DELAY_MS : 0, looking);
  const body = useKeepFocus(phase.name);
  const lead = !words && flow.mode === "palette" ? PHOTO.leadPlates : words ? PHOTO.wordsLead : PHOTO.lead;
  const footer =
    phase.name === "ready" && picked !== null ? (
      <BuyBar
        match={picked}
        busy={busy}
        onBuy={() => {
          onClose();
          buy(picked);
        }}
      />
    ) : phase.name === "ready" && flow.matches.length > 0 ? (
      <p className="photo-buy__hint" data-slot="photo-hint">{t(PHOTO.pickPrompt)}</p>
    ) : null;
  // The lead sentence scrolls with the body: fixed above it, with the buy bar below, it left no room for the cards at large text.
  return (
    <Sheet open={source !== null} onClose={onClose} title={t(words ? PHOTO.wordsTitle : PHOTO.title)} description={phase.name === "ready" ? t(lead) : undefined} footer={footer} scrollDescription>
      <Announce flow={flow} />
      <div ref={body} tabIndex={-1} className="photo-body" data-slot="photo-body">
        {showLooking ? <Looking flow={flow} onCancel={onClose} /> : null}
        {phase.name === "ready" ? <Ready flow={flow} remainingMinor={remainingMinor} /> : null}
        {phase.name === "error" ? <Problem problem={phase.problem} words={words} onRetry={flow.retry} onClose={onClose} onPickFile={onPickFile} /> : null}
      </div>
    </Sheet>
  );
}
