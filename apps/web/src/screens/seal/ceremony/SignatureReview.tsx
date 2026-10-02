// Seal variant "Signature" (axis: the metaphor). The rules are a document and sealing is signing it: press the button
// and a signature draws itself across the line at the bottom of the card and a shield with a tick lands at its end. No big
// padlock on the page; the card is the stage.
import type { ReactElement } from "react";
import { CEREMONY } from "../../../i18n/ceremony";
import { UI } from "../../../i18n/ui";
import { Button } from "../../../ui/Button";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { RulesSummary } from "../SealSteps";
import type { ReviewVariantProps } from "./HoldReview";
import "./ceremony.css";

export function SignatureReview({ form, sealed, onSeal }: ReviewVariantProps): ReactElement {
  const { t } = useLocale();
  return (
    <div className="seal-step seal-review cer-sign" data-sealed={sealed || undefined}>
      <div className="cer-sign__sheet">
        <RulesSummary form={form} signed={sealed} />
        <div className="cer-sign__line" aria-hidden="true">
          <Icon name="close" size={16} className="cer-sign__x" />
          <svg className="cer-sign__ink" viewBox="0 0 240 56" width="100%" height="56" focusable="false">
            <path className="cer-sign__path" pathLength={1} d="M8 40 C 22 8, 34 6, 30 30 S 28 52, 48 26 S 66 16, 72 34 C 76 46, 92 44, 100 28 C 106 14, 118 14, 116 30 S 126 46, 142 30 C 156 16, 168 24, 160 38 C 154 48, 176 46, 232 30" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        {sealed ? <Icon name="shieldCheck" size={28} className="cer-sign__done" /> : null}
      </div>
      <p className="seal-lead seal-review__lead">{t(UI["seal.reviewLead"])}</p>
      <div className="seal-actions">
        <Button size="lg" block icon={<Icon name={sealed ? "shieldCheck" : "lock"} size={22} />} disabled={sealed} onClick={onSeal} data-seal-button>
          {sealed ? t(CEREMONY.signed) : t(UI["seal.seal"])}
        </Button>
      </div>
    </div>
  );
}
