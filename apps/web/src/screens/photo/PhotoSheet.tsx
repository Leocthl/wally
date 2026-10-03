// "Show Wally a photo": the sheet that reads a picture. Wally looks (the booth's model when it has one, else the colours
// of the picture), says what it sees as chips the shopper can change, and lists four similar items from the simulated shop.
// The shopper picks one and asks Wally to buy it: from there the normal pipeline decides (planner proposal fixed by code,
// judge, rules R1 to R12, a one-off card, or Stopped before paying). The picture stays on this page and is never saved.
// Loaded as its own chunk the first time a picture is chosen.
import { useId, useMemo, type ReactElement } from "react";
import { colorSwatch } from "@wally/agent/vision";
import { Num } from "../../components/Num";
import { SIMULATED } from "../../domain/provenance";
import { useBoothContext } from "../../hooks/useBooth";
import { COLOR_WORDS, FIT_WORDS, itemName, KIND_WORDS, PATTERN_WORDS, PHOTO, seesPhrase, STYLE_WORDS } from "../../i18n/photo";
import type { LabelPair } from "../../i18n/label";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { Sheet } from "../../ui/Overlay";
import { Wally } from "../../wally/Wally";
import { MatchCards, shopName } from "./MatchCards";
import { ChipGroup, PaletteDots } from "./PhotoChips";
import { usePhotoPicker } from "./PhotoEntry";
import { chosenKind, COLOR_CHOICES, FIT_CHOICES, KIND_CHOICES, PATTERN_CHOICES, STYLE_CHOICES } from "./photoModel";
import { usePhotoBuy } from "./usePhotoBuy";
import { usePhotoFlow, type PhotoActions, type PhotoProblem, type PhotoView } from "./usePhotoFlow";
import "./photo.css";

export interface PhotoSheetProps {
  /** The picture the shopper chose; null closes the sheet. */
  readonly file: File | null;
  readonly onClose: () => void;
  /** "Choose another picture": hands a new file to the shell. */
  readonly onPickFile: (file: File) => void;
}

type Flow = PhotoView & PhotoActions;

/** One live region that stays in the sheet, so a screen reader hears each change of state (a region added with its text may be missed). */
function Announce({ phase }: { readonly phase: PhotoView["phase"] }): ReactElement {
  const { t } = useLocale();
  const text = phase.name === "ready" ? PHOTO.announceReady : phase.name === "error" ? PHOTO.announceProblem : PHOTO.announceLooking;
  return (
    <p className="sr-only" role="status" aria-live="polite" data-slot="photo-announce">
      {t(text)}
    </p>
  );
}

function Looking({ pictureUrl, onCancel }: { readonly pictureUrl: string | null; readonly onCancel: () => void }): ReactElement {
  const { t } = useLocale();
  return (
    <div className="photo-looking" data-slot="photo-looking">
      <div className="photo-looking__frame">
        {pictureUrl !== null ? <img className="photo-looking__img" src={pictureUrl} alt="" /> : null}
        <span className="photo-looking__scan" aria-hidden="true" />
      </div>
      <Wally state="thinking" size={56} decorative />
      <div className="photo-looking__text">
        <p className="photo-looking__title">{t(PHOTO.looking)}</p>
        <p className="photo-looking__detail">{t(PHOTO.lookingDetail)}</p>
      </div>
      <Button variant="ghost" onClick={onCancel}>{t(PHOTO.cancel)}</Button>
    </div>
  );
}

const PROBLEM_TEXT: Readonly<Record<PhotoProblem, { readonly title: LabelPair; readonly body: LabelPair }>> = {
  unreadable: { title: PHOTO.unreadable, body: PHOTO.unreadableHint },
  too_large: { title: PHOTO.tooLarge, body: PHOTO.tooLargeHint },
  failed: { title: PHOTO.failed, body: PHOTO.failedHint },
};

function Problem({ problem, onRetry, onClose, onPickFile }: { readonly problem: PhotoProblem; readonly onRetry: () => void; readonly onClose: () => void; readonly onPickFile: (file: File) => void }): ReactElement {
  const { t } = useLocale();
  const picker = usePhotoPicker(onPickFile);
  const text = PROBLEM_TEXT[problem];
  return (
    <div data-slot="photo-problem" data-problem={problem}>
      <EmptyState
        wally="stopped"
        size={96}
        title={t(text.title)}
        body={t(text.body)}
        action={
          problem === "failed" ? (
            <>
              <Button onClick={onRetry}>{t(PHOTO.tryAgain)}</Button>
              <Button variant="ghost" onClick={onClose}>{t(PHOTO.close)}</Button>
            </>
          ) : (
            <>
              <Button icon={<Icon name="camera" size={20} />} onClick={picker.open}>{t(PHOTO.chooseAnother)}</Button>
              {picker.input}
            </>
          )
        }
      />
    </div>
  );
}

function Chips({ flow }: { readonly flow: Flow }): ReactElement {
  const { t } = useLocale();
  const { attributes } = flow;
  const kind = chosenKind(attributes);
  const kinds = useMemo(() => KIND_CHOICES.map((id) => ({ id, text: t(KIND_WORDS[id]) })), [t]);
  const colors = useMemo(() => COLOR_CHOICES.map((id) => ({ id, text: t(COLOR_WORDS[id]), swatch: colorSwatch(id) })), [t]);
  return (
    <div className="photo-edit">
      <ChipGroup slot="photo-kind" title={kind === null ? t(PHOTO.typePick) : t(PHOTO.typeGroup)} mode="choose" attention={kind === null} options={kinds} selected={kind === null ? [] : [kind]} onPick={flow.setKind} />
      <ChipGroup slot="photo-colors" title={t(PHOTO.colorGroup)} mode="toggle" options={colors} selected={attributes.colors} onPick={flow.toggleColor} />
      <details className="photo-more">
        <summary>{t(PHOTO.moreGroup)}</summary>
        <div className="photo-more__body">
          <ChipGroup slot="photo-pattern" title={t(PHOTO.patternGroup)} mode="toggle" options={PATTERN_CHOICES.map((id) => ({ id, text: t(PATTERN_WORDS[id]) }))} selected={attributes.pattern === null ? [] : [attributes.pattern]} onPick={flow.setPattern} />
          <ChipGroup slot="photo-fit" title={t(PHOTO.fitGroup)} mode="toggle" options={FIT_CHOICES.map((id) => ({ id, text: t(FIT_WORDS[id]) }))} selected={attributes.fit === null || attributes.fit === "unknown" ? [] : [attributes.fit]} onPick={flow.setFit} />
          <ChipGroup slot="photo-style" title={t(PHOTO.styleGroup)} mode="toggle" options={STYLE_CHOICES.map((id) => ({ id, text: t(STYLE_WORDS[id]) }))} selected={attributes.style} onPick={flow.toggleStyle} />
        </div>
      </details>
    </div>
  );
}

function Notice({ notice }: { readonly notice: Flow["notice"] }): ReactElement | null {
  const { t } = useLocale();
  if (notice === undefined) return null;
  return (
    <p className="photo-note" role="status" data-slot="photo-notice" data-notice={notice}>
      <Icon name="info" size={18} />
      <span>{notice === "not_clothing" ? `${t(PHOTO.notClothing)} ${t(PHOTO.notClothingHint)}` : t(PHOTO.modelFailed)}</span>
    </p>
  );
}

function Ready({ flow, remainingMinor }: { readonly flow: Flow; readonly remainingMinor: number | null }): ReactElement {
  const { t, locale } = useLocale();
  const heading = useId();
  const { attributes, matches } = flow;
  const known = attributes.kind !== null && attributes.kind !== "not_clothing";
  const sees = known ? t(PHOTO.sees(seesPhrase(locale, attributes))) : t(PHOTO.seesNothingYet);
  // No kind chosen yet: ask for one. A kind the shop does not sell (a bag): say the shop has nothing like it.
  const empty = known ? t(PHOTO.noMatch) : t(PHOTO.noKindYet);
  return (
    <div className="photo" data-slot="photo-ready">
      <section className="photo-seen" aria-label={t(PHOTO.yourPicture)}>
        {flow.pictureUrl !== null ? <img className="photo-seen__img" src={flow.pictureUrl} alt={t(PHOTO.yourPicture)} /> : null}
        <div className="photo-seen__text">
          <p className="photo-seen__label" data-slot="photo-sees">{sees}</p>
          <PaletteDots palette={flow.palette} selected={attributes.colors} onToggle={flow.toggleColor} title={t(PHOTO.fromPlates)} />
        </div>
      </section>
      <Notice notice={flow.notice} />
      <Chips flow={flow} />
      <section aria-labelledby={heading} className="photo-shop" data-slot="photo-shop">
        <h3 id={heading} className="photo-shop__title">{t(PHOTO.similar)}</h3>
        {matches.length > 0 ? (
          <>
            <MatchCards matches={matches} pickedId={flow.pickedId} onPick={flow.pick} remainingMinor={remainingMinor} refreshing={flow.refreshing} label={t(PHOTO.similar)} />
          </>
        ) : (
          <p className="photo-shop__empty" role="status">{empty}</p>
        )}
        <p className="photo-shop__note">{t(PHOTO.shopNote)}</p>
      </section>
      <p className="photo-privacy" data-slot="photo-privacy">
        <Icon name="lock" size={16} />
        <span>{flow.mode === "model" ? t(PHOTO.privacyModel) : t(PHOTO.privacyDevice)}</span>
      </p>
    </div>
  );
}

export default function PhotoSheet({ file, onClose, onPickFile }: PhotoSheetProps): ReactElement {
  const { t, locale } = useLocale();
  const { api, info, state, busy } = useBoothContext();
  const flow = usePhotoFlow(file, { api, mode: info?.features?.see === "model" ? "model" : "palette" });
  const buy = usePhotoBuy();
  const remainingMinor = state.packet?.remaining_minor ?? null;
  const picked = flow.matches.find((m) => m.listingId === flow.pickedId) ?? null;
  const { phase } = flow;
  const footer =
    phase.name === "ready" && picked !== null ? (
      <div className="photo-buy" data-slot="photo-buy">
        <p className="photo-buy__line">
          {t(PHOTO.buyNamed(itemName(locale, picked)))} <span className="photo-buy__shop">{shopName(picked.merchantName)}</span>
        </p>
        <p className="photo-buy__note">
          {t(PHOTO.cardFor)} <Num kind="money" value={picked.totalMinor} prov={SIMULATED} /> {t(PHOTO.buyNote)}
        </p>
        <Button
          size="lg"
          block
          icon={<Icon name="sparkle" size={20} />}
          disabled={busy}
          data-slot="photo-buy-button"
          onClick={() => {
            onClose();
            buy(picked);
          }}
        >
          {t(PHOTO.buy)}
        </Button>
      </div>
    ) : phase.name === "ready" && flow.matches.length > 0 ? (
      <p className="photo-buy__hint" data-slot="photo-hint">{t(PHOTO.pickPrompt)}</p>
    ) : null;
  return (
    <Sheet open={file !== null} onClose={onClose} title={t(PHOTO.title)} description={phase.name === "ready" ? t(PHOTO.lead) : undefined} footer={footer}>
      <Announce phase={phase} />
      {phase.name === "idle" || phase.name === "preparing" || phase.name === "looking" ? <Looking pictureUrl={flow.pictureUrl} onCancel={onClose} /> : null}
      {phase.name === "ready" ? <Ready flow={flow} remainingMinor={remainingMinor} /> : null}
      {phase.name === "error" ? <Problem problem={phase.problem} onRetry={flow.retry} onClose={onClose} onPickFile={onPickFile} /> : null}
    </Sheet>
  );
}
