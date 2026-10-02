// Steps one and three of Seal, and the sealed state: Meet Wally (one screen, one sentence, Start), Check and seal (the
// summary and the big Seal button), and Sealed (the padlock closes, Wally is happy, "Go to your budget").
import type { ReactElement, ReactNode } from "react";
import { BRAND } from "../../brand";
import { SIMULATED } from "../../domain/provenance";
import { routeHref } from "../../hooks/useRoute";
import { UI } from "../../i18n/ui";
import { Button } from "../../ui/Button";
import { Icon, type IconName } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { Card } from "../../ui/Surface";
import { Wally } from "../../wally/Wally";
import { Fig, Fill, Money } from "../../shell/figures";
import { formatLongDay } from "../../shell/format";
import { categoriesText } from "../home/BudgetHero";
import { SealLock } from "./SealLock";
import { endOfHkDay, moneyOf, type RulesForm } from "./sealModel";

const PROV = SIMULATED;

export function MeetStep({ onStart }: { readonly onStart: () => void }): ReactElement {
  const { t } = useLocale();
  const points: readonly (readonly [IconName, string])[] = [
    ["card", t(UI["seal.meetPoint1"])],
    ["lock", t(UI["seal.meetPoint2"])],
    ["receipt", t(UI["seal.meetPoint3"])],
  ];
  return (
    <div className="seal-meet">
      <Wally state="idle" size={140} decorative />
      <h1 className="seal-h1">{t(UI["seal.meetTitle"](BRAND.name))}</h1>
      <p className="seal-meet__body">{t(UI["seal.meetBody"])}</p>
      <ul className="seal-meet__points">
        {points.map(([icon, text]) => (
          <li key={icon}><span className="seal-meet__icon"><Icon name={icon} size={20} /></span>{text}</li>
        ))}
      </ul>
      <div className="seal-actions">
        <Button size="lg" block iconEnd={<Icon name="chevronRight" size={20} />} onClick={onStart}>{t(UI["seal.start"])}</Button>
      </div>
    </div>
  );
}

function SummaryRow({ icon, label, children }: { readonly icon: IconName; readonly label: string; readonly children: ReactNode }): ReactElement {
  return (
    <li className="seal-summary__row">
      <span className="seal-summary__icon"><Icon name={icon} size={20} /></span>
      <span className="seal-summary__label">{label}</span>
      <span className="seal-summary__value">{children}</span>
    </li>
  );
}

/** The rules as a short list (SIMULATED figures, covered by the top bar's note). Edit goes back to the rows. */
export function RulesSummary({ form, onEdit, editDisabled = false }: { readonly form: RulesForm; readonly onEdit?: () => void; readonly editDisabled?: boolean }): ReactElement {
  const { t, locale } = useLocale();
  const amount = moneyOf(form.amount) ?? 0;
  const ask = form.askAbove === null ? null : moneyOf(form.askAbove);
  const cap = form.cap === null ? null : moneyOf(form.cap);
  return (
    <Card className="seal-summary">
      {onEdit ? <Button variant="ghost" size="sm" className="seal-summary__edit" onClick={onEdit} disabled={editDisabled}>{t(UI["seal.edit"])}</Button> : null}
      <ul className="seal-summary__list">
        <SummaryRow icon="wallet" label={t(UI["seal.summaryAmount"])}><Money minor={amount} prov={PROV} className="seal-summary__amount" /></SummaryRow>
        <SummaryRow icon="tag" label={t(UI["seal.summaryWhat"])}>{categoriesText(form.categories, t)}</SummaryRow>
        <SummaryRow icon="store" label={t(UI["seal.summarySellers"])}>{t(UI[form.verifiedOnly ? "seal.verifiedOnly" : "home.ruleAnySeller"])}</SummaryRow>
        <SummaryRow icon="clock" label={t(UI["seal.summaryUntil"])}><Fig prov={PROV} kind="time">{formatLongDay(endOfHkDay(form.until), locale)}</Fig></SummaryRow>
        {ask !== null ? <SummaryRow icon="hand" label={t(UI["seal.summaryExtra"])}><Fill text={t(UI["home.ruleAsk"])} slots={{ amount: <Money minor={ask} prov={PROV} /> }} /></SummaryRow> : null}
        {cap !== null ? <SummaryRow icon="card" label={t(UI["seal.summaryExtra"])}><Fill text={t(UI["home.ruleCap"])} slots={{ amount: <Money minor={cap} prov={PROV} /> }} /></SummaryRow> : null}
        {form.share !== null ? <SummaryRow icon="card" label={t(UI["seal.summaryExtra"])}><Fill text={t(UI["home.ruleShare"])} slots={{ share: <Fig prov={PROV} kind="percent">{`${form.share}%`}</Fig> }} /></SummaryRow> : null}
      </ul>
    </Card>
  );
}

export interface ReviewStepProps {
  readonly form: RulesForm;
  readonly sealing: boolean;
  readonly replacing: boolean;
  readonly onEdit: () => void;
  readonly onSeal: () => void;
}

export function ReviewStep({ form, sealing, replacing, onEdit, onSeal }: ReviewStepProps): ReactElement {
  const { t } = useLocale();
  return (
    <div className="seal-step seal-review">
      <SealLock locked={false} size={96} className="seal-review__lock" />
      <RulesSummary form={form} onEdit={onEdit} editDisabled={sealing} />
      <p className="seal-lead seal-review__lead">{t(UI["seal.reviewLead"])}</p>
      {replacing ? <p className="seal-note seal-note--info"><Icon name="info" size={18} /> {t(UI["seal.newLog"])}</p> : null}
      <div className="seal-actions">
        <Button size="lg" block icon={<Icon name="lock" size={22} />} loading={sealing} onClick={onSeal} data-seal-button>
          {sealing ? t(UI["seal.sealing"]) : t(UI["seal.seal"])}
        </Button>
      </div>
    </div>
  );
}

export function DoneStep({ form }: { readonly form: RulesForm }): ReactElement {
  const { t } = useLocale();
  return (
    <div className="seal-done" role="status" aria-live="polite">
      <div className="seal-done__art">
        <SealLock locked size={120} />
        <Wally state="approved" size={88} decorative className="seal-done__wally" />
      </div>
      <h1 className="seal-h1">{t(UI["seal.sealedTitle"])}</h1>
      <p className="seal-done__body">{t(UI["seal.sealedBody"])}</p>
      <RulesSummary form={form} />
      <div className="seal-actions">
        <a className="w-btn w-btn--primary w-btn--lg w-btn--block" href={routeHref("budget")} data-go-budget>
          <span className="w-btn__label">{t(UI["seal.go"])}</span>
          <span className="w-btn__icon"><Icon name="chevronRight" size={20} /></span>
        </a>
      </div>
    </div>
  );
}
