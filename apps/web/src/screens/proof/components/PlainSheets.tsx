// "How is this checked?" on plain Proof: four short parts in everyday words (receipts lock to the one before, who signs,
// receipts cut off the end, what the check does not prove), then the way to check it yourself. No hash, key names or file
// formats; the technical version stays in developer mode.
import type { ReactElement } from "react";
import { UI } from "../../../i18n/ui";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { Sheet } from "../../../ui/Overlay";
import { PLAIN } from "../plainStrings";
import { VERIFIER_HREF } from "./ProofSheets";

const P = UI.proof;

export function PlainHowSheet({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }): ReactElement {
  const { t } = useLocale();
  const parts = [
    [PLAIN.how.lockTitle, PLAIN.how.lockBody, "list"],
    [PLAIN.how.signTitle, PLAIN.how.signBody, "shieldCheck"],
    [PLAIN.how.endTitle, PLAIN.how.endBody, "check"],
    [P.howNotTitle, P.howNotBody, "info"],
  ] as const;
  return (
    <Sheet open={open} onClose={onClose} title={t(P.howTitle)}>
      <div className="pf-how">
        {parts.map(([title, body, icon]) => (
          <section key={title.en} className="pf-how__part">
            <span className="pf-how__icon"><Icon name={icon} size={20} /></span>
            <div>
              <h3 className="pf-how__title">{t(title)}</h3>
              <p className="pf-how__body">{t(body)}</p>
            </div>
          </section>
        ))}
        <p className="pf-how__yourself">{t(PLAIN.how.yourself)}</p>
        <a className="w-btn w-btn--secondary w-btn--md w-btn--block" href={VERIFIER_HREF}>
          <span className="w-btn__icon"><Icon name="shieldCheck" size={20} /></span>
          <span className="w-btn__label">{t(PLAIN.openChecker)}</span>
        </a>
      </div>
    </Sheet>
  );
}
