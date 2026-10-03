// The first budget's form: how much (presets or a typed amount), for how long, what Wally can buy, verified sellers, and
// whose money when the booth offers family budgets. It edits a BudgetDraft; the Seal screen's own checks say what is wrong
// and the Seal ceremony does the sealing. Figures are SIMULATED: the section shows one chip for all of them.
import { useId, type ReactElement } from "react";
import { SIMULATED } from "../../domain/provenance";
import { OB } from "../../i18n/onboarding";
import { UI } from "../../i18n/ui";
import { cx } from "../../ui/cx";
import { Switch, TextField } from "../../ui/Form";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { Segmented } from "../../ui/Nav";
import { Fig, Fill, ScopeChip } from "../../shell/figures";
import { formatLongDay } from "../../shell/format";
import { categoryName } from "../home/BudgetHero";
import type { FamilySeal } from "../seal/FamilyChoice";
import { CATEGORY_SLUGS, endOfHkDay, hkDay, type FormErrors } from "../seal/sealModel";
import { ChipGroup } from "./controls";
import { HOW_LONG, maxDay, type BudgetDraft, type HowLong } from "./budgetModel";
import { PresetPicker } from "./PresetPicker";

export interface BudgetPickerProps {
  readonly draft: BudgetDraft;
  readonly onDraft: (next: BudgetDraft) => void;
  readonly errors: FormErrors;
  /** The problems are shown (the person pressed Review, or left the field). */
  readonly showErrors: boolean;
  /** The day the budget ends on, after any cut. */
  readonly until: string;
  /** The date the person picked was cut to the longest a budget may run. */
  readonly capped: boolean;
  readonly now: Date;
  readonly family: FamilySeal;
}

const HOW_LONG_LABEL = { month: OB.budget.thisMonth, twoWeeks: OB.budget.twoWeeks, date: OB.budget.pickDate } as const;

export function BudgetPicker({ draft, onDraft, errors, showErrors, until, capped, now, family }: BudgetPickerProps): ReactElement {
  const { t, locale } = useLocale();
  const amountHeading = useId();
  const lengthHeading = useId();
  const set = (patch: Partial<BudgetDraft>): void => onDraft({ ...draft, ...patch });
  const err = (field: keyof FormErrors): string | undefined => {
    const key = errors[field];
    return key !== undefined && showErrors ? t(UI[key]) : undefined;
  };
  const today = hkDay(now.toISOString());
  return (
    <div className="onb-body" data-chip-scope>
      <ScopeChip prov={SIMULATED} className="onb-scope" />
      <p className="onb-lead">{t(OB.budget.lead)}</p>

      <section className="onb-block" aria-labelledby={amountHeading}>
        <h2 className="onb-label" id={amountHeading}>{t(OB.budget.howMuch)}</h2>
        <PresetPicker value={draft.amount} onChange={(amount) => set({ amount })} labelledBy={amountHeading} />
        {draft.amount === "custom" ? (
          <TextField
            label={t(UI["seal.amount"])}
            hint={t(UI["seal.amountHint"])}
            value={draft.custom}
            inputMode="decimal"
            autoComplete="off"
            leading={<span className="onb-unit">HK$</span>}
            error={family.notes.amount ?? err("amount")}
            data-field="amount"
            onChange={(e) => set({ custom: e.target.value })}
          />
        ) : family.notes.amount ? (
          <p className="onb-note" role="status"><Icon name="alert" size={16} /> {family.notes.amount}</p>
        ) : null}
      </section>

      <section className="onb-block" aria-labelledby={lengthHeading}>
        <h2 className="onb-label" id={lengthHeading}>{t(OB.budget.howLong)}</h2>
        <Segmented<HowLong>
          label={t(OB.budget.howLong)}
          size="md"
          value={draft.howLong}
          onChange={(howLong) => set({ howLong })}
          options={HOW_LONG.map((value) => ({ value, label: t(HOW_LONG_LABEL[value]) }))}
        />
        {draft.howLong === "date" ? (
          <TextField
            label={t(UI["seal.until"])}
            type="date"
            min={today}
            max={maxDay(now)}
            value={draft.date}
            error={err("until")}
            data-field="until"
            onChange={(e) => set({ date: e.target.value })}
          />
        ) : null}
        <p className={cx("onb-hint", "onb-ends")}>
          <Fill text={t(OB.budget.ends)} slots={{ until: <Fig prov={SIMULATED} kind="time">{formatLongDay(endOfHkDay(until), locale)}</Fig> }} />
        </p>
        {capped ? <p className="onb-note" role="status"><Icon name="info" size={16} /> {t(OB.budget.cutShort)}</p> : null}
      </section>

      <section className="onb-block" aria-labelledby="onb-what">
        <h2 className="onb-label" id="onb-what">{t(UI["seal.what"])}</h2>
        <ChipGroup
          label={t(UI["seal.what"])}
          options={CATEGORY_SLUGS.map((id) => ({ id, label: categoryName(id, t) }))}
          selected={draft.categories}
          onChange={(categories) => set({ categories })}
        />
        {err("categories") ? <span className="w-field__error" data-field="categories"><Icon name="alert" size={16} />{err("categories")}</span> : null}
      </section>

      <section className="onb-block onb-switch">
        <Switch label={t(UI["seal.verifiedOnly"])} description={t(UI["seal.verifiedHint"])} checked={draft.verifiedOnly} onChange={(verifiedOnly) => set({ verifiedOnly })} />
      </section>

      {family.choice}
    </div>
  );
}
