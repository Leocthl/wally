// The quiet parts of the photo sheet: the one live region that tells a screen reader what changed, Wally looking, the
// problem screen, the notices that explain an empty list, and the price limit row. Each says only what is true of the
// state it is shown in.
import { useEffect, useState, type ReactElement } from "react";
import { Num } from "../../components/Num";
import { SIMULATED } from "../../domain/provenance";
import type { LabelPair } from "../../i18n/label";
import { PHOTO } from "../../i18n/photo";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { Wally } from "../../wally/Wally";
import { usePhotoPicker } from "./PhotoEntry";
import type { PhotoActions, PhotoProblem, PhotoView } from "./usePhotoFlow";

export type Flow = PhotoView & PhotoActions;

/** What to say for the state the sheet is in: the first answer, a refreshed list, a failed refresh, or a problem. */
export function announcementFor(flow: PhotoView): LabelPair {
  const { phase } = flow;
  if (phase.name === "error") return PHOTO.announceProblem;
  if (phase.name !== "ready") return flow.mode === "words" ? PHOTO.announceLookingWords : PHOTO.announceLooking;
  if (flow.lookupFailed) return PHOTO.lookupFailed;
  if (flow.updates > 0) return PHOTO.announceUpdated(flow.matches.length);
  return flow.matches.length > 0 ? PHOTO.announceFound(flow.matches.length) : PHOTO.announceNone;
}

/** One live region that stays in the sheet, so a screen reader hears each change of state (a region added with its text may be missed). */
export function Announce({ flow }: { readonly flow: PhotoView }): ReactElement {
  const { t } = useLocale();
  return (
    <p className="sr-only" role="status" aria-live="polite" data-slot="photo-announce">
      {t(announcementFor(flow))}
    </p>
  );
}

/** True once `active` has been true for `ms` (immediately when ms is 0): words are read in a blink, and a panel that flashes is worse than none. */
export function useAfter(ms: number, active: boolean): boolean {
  const [late, setLate] = useState(ms === 0);
  useEffect(() => {
    if (!active || ms === 0) {
      setLate(ms === 0);
      return undefined;
    }
    const timer = setTimeout(() => setLate(true), ms);
    return () => clearTimeout(timer);
  }, [active, ms]);
  return active && late;
}

export function Looking({ flow, onCancel }: { readonly flow: PhotoView; readonly onCancel: () => void }): ReactElement {
  const { t } = useLocale();
  const words = flow.mode === "words";
  return (
    <div className="photo-looking" data-slot="photo-looking">
      {words ? null : (
        <div className="photo-looking__frame">
          {flow.pictureUrl !== null ? <img className="photo-looking__img" src={flow.pictureUrl} alt="" /> : null}
          <span className="photo-looking__scan" aria-hidden="true" />
        </div>
      )}
      <Wally state="thinking" size={56} decorative />
      <div className="photo-looking__text">
        <p className="photo-looking__title">{t(PHOTO.looking)}</p>
        <p className="photo-looking__detail">{t(words ? PHOTO.announceLookingWords : PHOTO.lookingDetail)}</p>
      </div>
      {words ? null : (
        <p className="photo-privacy" data-slot="photo-privacy">
          <Icon name="lock" size={16} />
          <span>{t(flow.mode === "model" ? PHOTO.privacyModel : PHOTO.privacyDevice)}</span>
        </p>
      )}
      <Button variant="ghost" onClick={onCancel}>{t(PHOTO.cancel)}</Button>
    </div>
  );
}

const PROBLEM_TEXT: Readonly<Record<PhotoProblem, { readonly title: LabelPair; readonly body: LabelPair }>> = {
  unreadable: { title: PHOTO.unreadable, body: PHOTO.unreadableHint },
  too_large: { title: PHOTO.tooLarge, body: PHOTO.tooLargeHint },
  failed: { title: PHOTO.failed, body: PHOTO.failedHint },
};

export function Problem({ problem, words, onRetry, onClose, onPickFile }: { readonly problem: PhotoProblem; readonly words: boolean; readonly onRetry: () => void; readonly onClose: () => void; readonly onPickFile: (file: File) => void }): ReactElement {
  const { t } = useLocale();
  const picker = usePhotoPicker(onPickFile);
  const text = PROBLEM_TEXT[problem];
  const retry = problem === "failed" || words;
  return (
    <div data-slot="photo-problem" data-problem={problem}>
      <EmptyState
        wally="stopped"
        size={96}
        title={t(text.title)}
        body={t(text.body)}
        action={
          retry ? (
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

/** Two sentences, joined the way the language joins them. */
const sentences = (zh: boolean, first: string, second: string): string => (zh ? `${first}${second}` : `${first} ${second}`);

export function Notice({ notice }: { readonly notice: PhotoView["notice"] }): ReactElement | null {
  const { t, locale } = useLocale();
  if (notice === undefined) return null;
  const zh = locale === "zh-HK";
  const text =
    notice === "not_clothing"
      ? sentences(zh, t(PHOTO.notClothing), t(PHOTO.notClothingHint))
      : notice === "model_failed"
        ? t(PHOTO.modelFailed)
        : notice === "not_sold"
          ? sentences(zh, t(PHOTO.wordsNotSold), t(PHOTO.wordsPickKind))
          : sentences(zh, t(PHOTO.wordsNothing), t(PHOTO.wordsPickKind));
  return (
    <p className="photo-note" role="status" data-slot="photo-notice" data-notice={notice}>
      <Icon name="info" size={18} />
      <span>{text}</span>
    </p>
  );
}

/** The most the shopper said they would pay, as a line they can lift: items above it are left out of the list. */
export function LimitRow({ flow }: { readonly flow: Flow }): ReactElement | null {
  const { t } = useLocale();
  if (flow.maxPriceMinor === null) return null;
  return (
    <div className="photo-limit" data-slot="photo-limit">
      <p className="photo-limit__text">
        {t(PHOTO.limitLabel)} <Num kind="money" value={flow.maxPriceMinor} prov={SIMULATED} />
      </p>
      <Button variant="ghost" onClick={flow.clearLimit}>{t(PHOTO.limitRemove)}</Button>
    </div>
  );
}

/** A refresh that failed: the list is the one for the choice before, and the shopper can repeat the look-up. */
export function LookupFailed({ flow }: { readonly flow: Flow }): ReactElement | null {
  const { t } = useLocale();
  if (!flow.lookupFailed) return null;
  return (
    <div className="photo-note" role="status" data-slot="photo-lookup-failed">
      <Icon name="info" size={18} />
      <span>{t(PHOTO.lookupFailed)}</span>
      <Button variant="ghost" onClick={flow.retryLookup}>{t(PHOTO.tryAgain)}</Button>
    </div>
  );
}
