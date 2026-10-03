// Where a picture comes in: a hidden file input that offers the camera or the library on a phone, the camera button inside
// the Ask field (next to the mic), the "Show Wally a photo" row on Home and the shortcut among the Ask sheet's pills. They
// only hand a File to the shell; the sheet that reads it (PhotoSheet) is loaded the first time one is chosen, so these few
// lines are all the first load pays for.
import { useCallback, useRef, type ChangeEvent, type ReactElement } from "react";
import { PHOTO } from "../../i18n/photo";
import "./photo-entry.css";
import { IconButton } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";

export interface PhotoPicker {
  /** Render once, anywhere inside the control that opens it. */
  readonly input: ReactElement;
  readonly open: () => void;
}

/** A visually hidden `<input type="file" accept="image/*">`; on a phone the browser offers the camera or the library. */
export function usePhotoPicker(onFile: (file: File) => void): PhotoPicker {
  const ref = useRef<HTMLInputElement>(null);
  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => {
      const file = e.currentTarget.files?.[0];
      e.currentTarget.value = ""; // the same file can be chosen again
      if (file !== undefined) onFile(file);
    },
    [onFile],
  );
  const open = useCallback(() => ref.current?.click(), []);
  return { input: <input ref={ref} type="file" accept="image/*" className="photo-file" tabIndex={-1} aria-hidden="true" data-slot="photo-file" onChange={onChange} />, open };
}

/** The camera button beside the mic in the Ask field. */
export function PhotoButton({ onFile, disabled = false }: { readonly onFile: (file: File) => void; readonly disabled?: boolean }): ReactElement {
  const { t } = useLocale();
  const picker = usePhotoPicker(onFile);
  return (
    <>
      <IconButton label={t(PHOTO.entryButton)} icon={<Icon name="camera" />} onClick={picker.open} disabled={disabled} data-slot="photo-button" />
      {picker.input}
    </>
  );
}

/** The "Show Wally a photo" shortcut among the Ask sheet's pills, styled with the Try asking pills. */
export function PhotoPill({ onFile, busy = false }: { readonly onFile: (file: File) => void; readonly busy?: boolean }): ReactElement {
  const { t } = useLocale();
  const picker = usePhotoPicker(onFile);
  return (
    <div className="home-try__group">
      <ul className="home-try__grid">
        <li>
          <button type="button" className="home-try__card" data-slot="photo-pill" disabled={busy} onClick={picker.open}>
            <span className={cx("home-try__icon", "home-try__icon--primary")}>
              <Icon name="camera" size={20} />
            </span>
            <span className="home-try__title">{t(PHOTO.entryTitle)}</span>
          </button>
          {picker.input}
        </li>
      </ul>
    </div>
  );
}

/** The "Show Wally a photo" row on Home, right under the "What do you need?" row (screens/home/slots.tsx). */
export function PhotoRow({ onFile, busy = false }: { readonly onFile: (file: File) => void; readonly busy?: boolean }): ReactElement {
  const { t } = useLocale();
  const picker = usePhotoPicker(onFile);
  return (
    <>
      <button type="button" className="home-photo" data-slot="photo-card" disabled={busy} onClick={picker.open}>
        <span className="home-photo__icon" aria-hidden="true">
          <Icon name="camera" size={22} />
        </span>
        <span className="home-photo__text">
          <span className="home-photo__title">{t(PHOTO.entryTitle)}</span>
          <span className="home-photo__desc">{t(PHOTO.entryDesc)}</span>
        </span>
        <Icon name="chevronRight" size={20} className="home-photo__chevron" />
      </button>
      {picker.input}
    </>
  );
}
