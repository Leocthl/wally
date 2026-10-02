// One editable compiled rule chip: the rule id, a labelled control, and the value as a figure with its chip.
// Invalid values mark the control aria-invalid and explain why, so Seal stays disabled for a reason the visitor can fix.
import { useId, useState, type ReactElement } from "react";
import { dollarsToMinor, minorToDollarsText } from "../domain/money";
import type { ChipValue, RuleChip } from "../booth/compile";
import { label, type LabelPair } from "../i18n/label";
import { Bi } from "./Bi";
import { Num } from "./Num";

const CATEGORIES: readonly (readonly [string, string, string])[] = [
  ["apparel", "Clothes", "衣服"],
  ["footwear", "Shoes", "鞋"],
  ["electronics", "Electronics", "電子產品"],
  ["groceries", "Groceries", "雜貨"],
];
/** Basis points in a whole: 100% = 10,000 bp (mandate.schema share_of_remaining_bp). */
const BP_PER_PERCENT = 100;

export interface ChipEditorProps {
  readonly chip: RuleChip;
  readonly onChange: (next: RuleChip) => void;
}

const ERR = {
  amount: label("Enter an amount above zero.", "請輸入大於零的金額。"),
  percent: label("Enter a whole percent from one to one hundred.", "請輸入一至一百之間的整數百分比。"),
  days: label("Days must be a whole number of at least one.", "日數必須是至少一的整數。"),
  category: label("Pick at least one category.", "請至少選一個類別。"),
};

function withValue(chip: RuleChip, value: ChipValue, valid: boolean, error?: LabelPair): RuleChip {
  const { error: _error, ...rest } = chip;
  return { ...rest, value, valid, ...(valid || !error ? {} : { error }) };
}

function AmountControl({ chip, amount, onChange, build }: { readonly chip: RuleChip; readonly amount: number | null; readonly onChange: (c: RuleChip) => void; readonly build: (m: number | null) => ChipValue }): ReactElement {
  const id = useId();
  const [text, setText] = useState(amount === null ? "" : minorToDollarsText(amount));
  const minor = dollarsToMinor(text);
  const valid = minor !== null && minor > 0;
  return (
    <>
      <label htmlFor={id} className="chip-editor__label"><Bi text={chip.label} /></label>
      <div className="chip-editor__control">
        <span aria-hidden="true">HK$</span>
        <input id={id} inputMode="decimal" value={text} aria-invalid={!valid} onChange={(e) => {
          const t = e.target.value;
          setText(t);
          const m = dollarsToMinor(t);
          onChange(withValue(chip, build(m), m !== null && m > 0, ERR.amount));
        }} />
        {valid ? <Num kind="money" value={minor} prov={chip.prov} /> : null}
      </div>
    </>
  );
}

function ControlFor({ chip, onChange }: ChipEditorProps): ReactElement {
  const id = useId();
  const v = chip.value;
  switch (v.kind) {
    case "budget":
      return <AmountControl chip={chip} amount={v.amountMinor} onChange={onChange} build={(m) => ({ kind: "budget", amountMinor: m })} />;
    case "cap":
      return <AmountControl chip={chip} amount={v.amountMinor} onChange={onChange} build={(m) => ({ kind: "cap", amountMinor: m ?? 0 })} />;
    case "askAbove":
      return <AmountControl chip={chip} amount={v.amountMinor} onChange={onChange} build={(m) => ({ kind: "askAbove", amountMinor: m ?? 0 })} />;
    case "share":
      return (
        <>
          <label htmlFor={id} className="chip-editor__label"><Bi text={chip.label} /></label>
          <div className="chip-editor__control">
            <input id={id} inputMode="numeric" defaultValue={String(v.bp / BP_PER_PERCENT)} aria-invalid={!chip.valid} onChange={(e) => {
              const pct = Number.parseInt(e.target.value, 10);
              const ok = Number.isInteger(pct) && pct > 0 && pct <= BP_PER_PERCENT;
              onChange(withValue(chip, { kind: "share", bp: ok ? pct * BP_PER_PERCENT : 0 }, ok, ERR.percent));
            }} />
            <span aria-hidden="true">%</span>
          </div>
        </>
      );
    case "expiry":
      return (
        <>
          <label htmlFor={id} className="chip-editor__label"><Bi text={chip.label} /></label>
          <div className="chip-editor__control">
            <select id={id} value={v.mode} onChange={(e) => {
              const mode = e.target.value === "days" ? "days" : "month_end";
              onChange(withValue(chip, { kind: "expiry", mode, days: v.days || 1 }, true));
            }}>
              <option value="month_end">Month end · 月底</option>
              <option value="days">Days from seal · 封好後日數</option>
            </select>
            {v.mode === "days" ? (
              <input aria-label="Days" inputMode="numeric" defaultValue={String(v.days)} aria-invalid={!chip.valid} onChange={(e) => {
                const days = Number.parseInt(e.target.value, 10);
                const ok = Number.isInteger(days) && days >= 1;
                onChange(withValue(chip, { kind: "expiry", mode: "days", days: ok ? days : 0 }, ok, ERR.days));
              }} />
            ) : null}
          </div>
        </>
      );
    case "category":
      return (
        <fieldset className="chip-editor__set">
          <legend className="chip-editor__label"><Bi text={chip.label} /></legend>
          {CATEGORIES.map(([slug, en, zh]) => (
            <label key={slug} className="chip-editor__check tap">
              <input type="checkbox" checked={v.slugs.includes(slug)} onChange={(e) => {
                const slugs = e.target.checked ? [...v.slugs, slug] : v.slugs.filter((s) => s !== slug);
                onChange(withValue(chip, { kind: "category", slugs }, slugs.length > 0, ERR.category));
              }} />
              <span>{en} · <span lang="zh-HK">{zh}</span></span>
            </label>
          ))}
        </fieldset>
      );
    case "sellers":
      return (
        <label className="chip-editor__check tap">
          <input type="checkbox" checked={v.verifiedOnly} onChange={(e) => onChange(withValue(chip, { kind: "sellers", verifiedOnly: e.target.checked }, true))} />
          <span><Bi text={chip.label} /> <span className="soft">Verified sellers only · 只限已核實賣家</span></span>
        </label>
      );
  }
}

export function ChipEditor({ chip, onChange }: ChipEditorProps): ReactElement {
  return (
    <li className={`chip-editor ${chip.valid ? "" : "chip-editor--invalid"}`.trim()} data-chip-kind={chip.kind} data-valid={chip.valid}>
      <span className="chip-editor__rule" data-ident>{chip.rule}</span>
      <div className="chip-editor__body">
        <ControlFor chip={chip} onChange={onChange} />
        {!chip.valid && chip.error ? <p className="chip-editor__error" role="alert"><Bi text={chip.error} /></p> : null}
      </div>
    </li>
  );
}
