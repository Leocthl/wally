// The rules as editable rows: amount, what Wally can buy, sellers, until, and any per-buy rules the sentence named.
// An error is words beside an icon on the field (aria-invalid, aria-describedby), shown once a field is touched or Next
// is pressed.
import { useId, type ReactElement } from "react";
import type { LabelPair } from "../../i18n/label";
import { UI } from "../../i18n/ui";
import { IconButton } from "../../ui/Button";
import { TextField, Switch } from "../../ui/Form";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { categoryName } from "../home/BudgetHero";
import { CATEGORY_SLUGS, type FieldName, type FormErrors, type RulesForm } from "./sealModel";

export interface RulesEditorProps {
  readonly form: RulesForm;
  readonly errors: FormErrors;
  /** Fields whose errors are shown (touched, or all after Next). */
  readonly shown: ReadonlySet<FieldName>;
  readonly today: string;
  readonly onChange: (next: RulesForm) => void;
  readonly onTouch: (field: FieldName) => void;
  /** Words that show beside a field at once, ahead of its own error (a limit set by someone else). */
  readonly notes?: Partial<Record<FieldName, string>>;
}

function errorText(errors: FormErrors, shown: ReadonlySet<FieldName>, field: FieldName, t: (p: LabelPair) => string): string | undefined {
  const key = errors[field];
  return key && shown.has(field) ? t(UI[key]) : undefined;
}

function Categories({ form, error, onChange, onTouch }: { readonly form: RulesForm; readonly error: string | undefined; readonly onChange: (next: RulesForm) => void; readonly onTouch: () => void }): ReactElement {
  const { t } = useLocale();
  const errorId = useId();
  const toggle = (slug: string): void => {
    const has = form.categories.includes(slug);
    onChange({ ...form, categories: has ? form.categories.filter((s) => s !== slug) : [...form.categories, slug] });
    onTouch();
  };
  return (
    <div className="seal-field" data-field="categories">
    <fieldset className="seal-cats" data-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}>
      <legend className="w-field__label">{t(UI["seal.what"])}</legend>
      <div className="seal-cats__list">
        {CATEGORY_SLUGS.map((slug) => {
          const on = form.categories.includes(slug);
          return (
            <button key={slug} type="button" className="seal-cat" aria-pressed={on} onClick={() => toggle(slug)}>
              <span className="seal-cat__tick" aria-hidden="true">{on ? <Icon name="check" size={16} strokeWidth={3} /> : null}</span>
              {categoryName(slug, t)}
            </button>
          );
        })}
      </div>
      {error ? <span id={errorId} className="w-field__error"><Icon name="alert" size={16} />{error}</span> : null}
    </fieldset>
    </div>
  );
}

function ExtraAmount({ field, label, value, error, onValue, onRemove, onTouch, percent = false }: {
  readonly field: FieldName;
  readonly label: string;
  readonly value: string;
  readonly error: string | undefined;
  readonly onValue: (v: string) => void;
  readonly onRemove: () => void;
  readonly onTouch: () => void;
  readonly percent?: boolean;
}): ReactElement {
  const { t } = useLocale();
  return (
    <div className="seal-field seal-extra" data-field={field}>
      <TextField
        label={label}
        value={value}
        inputMode={percent ? "numeric" : "decimal"}
        autoComplete="off"
        error={error}
        onChange={(e) => onValue(e.target.value)}
        onBlur={onTouch}
        {...(percent ? { trailing: <span className="seal-unit">%</span> } : { leading: <span className="seal-unit">HK$</span> })}
      />
      <IconButton label={t(UI["seal.remove"])} icon={<Icon name="close" size={18} />} onClick={onRemove} className="seal-extra__remove" />
    </div>
  );
}

export function RulesEditor({ form, errors, shown, today, onChange, onTouch, notes }: RulesEditorProps): ReactElement {
  const { t } = useLocale();
  const err = (f: FieldName): string | undefined => notes?.[f] ?? errorText(errors, shown, f, t);
  return (
    <div className="seal-rules">
      <div className="seal-field" data-field="amount">
        <TextField
          label={t(UI["seal.amount"])}
          hint={t(UI["seal.amountHint"])}
          value={form.amount}
          inputMode="decimal"
          autoComplete="off"
          leading={<span className="seal-unit">HK$</span>}
          error={err("amount")}
          onChange={(e) => onChange({ ...form, amount: e.target.value })}
          onBlur={() => onTouch("amount")}
        />
      </div>
      <Categories form={form} error={err("categories")} onChange={onChange} onTouch={() => onTouch("categories")} />
      <div className="seal-field seal-sellers" data-field="sellers">
        <Switch label={t(UI["seal.verifiedOnly"])} description={t(UI["seal.verifiedHint"])} checked={form.verifiedOnly} onChange={(v) => onChange({ ...form, verifiedOnly: v })} />
      </div>
      <div className="seal-field" data-field="until">
        <TextField
          label={t(UI["seal.until"])}
          type="date"
          min={today}
          value={form.until}
          error={err("until")}
          onChange={(e) => onChange({ ...form, until: e.target.value })}
          onBlur={() => onTouch("until")}
        />
      </div>
      {form.askAbove !== null ? (
        <ExtraAmount field="askAbove" label={t(UI["seal.askAbove"])} value={form.askAbove} error={err("askAbove")} onValue={(v) => onChange({ ...form, askAbove: v })} onRemove={() => onChange({ ...form, askAbove: null })} onTouch={() => onTouch("askAbove")} />
      ) : null}
      {form.cap !== null ? (
        <ExtraAmount field="cap" label={t(UI["seal.cap"])} value={form.cap} error={err("cap")} onValue={(v) => onChange({ ...form, cap: v })} onRemove={() => onChange({ ...form, cap: null })} onTouch={() => onTouch("cap")} />
      ) : null}
      {form.share !== null ? (
        <ExtraAmount field="share" percent label={t(UI["seal.share"])} value={form.share} error={err("share")} onValue={(v) => onChange({ ...form, share: v })} onRemove={() => onChange({ ...form, share: null })} onTouch={() => onTouch("share")} />
      ) : null}
    </div>
  );
}
