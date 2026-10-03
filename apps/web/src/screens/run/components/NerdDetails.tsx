// "Details for nerds": the engine's own sentence, every rule result with its recorded inputs, comparator and threshold
// source, Wally's read of the listing (probability against its limit), the checker record, the decision id and its
// receipt. Rule ids live here and only here. Values are formatted, never dumped as JSON.
import type { ReactElement } from "react";
import { render as coreRender } from "@wally/core/explain";
import type { Decision, TemplateId } from "../../../api/types";
import { formatHkd } from "../../../domain/money";
import { ASSUMED, cartProv, judgeProv, type Prov } from "../../../domain/provenance";
import { UI } from "../../../i18n/ui";
import { useIsDeveloper } from "../../../state/displayMode";
import { ProvenanceChip } from "../../../ui/Chip";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { receiptNumber } from "../../proof/receiptNo";
import { engineLine } from "../model/reason";
import { receiptHref } from "../useDecisionParam";

const R = UI.run;
type Rule = Decision["rules"][number];

function show(key: string, value: unknown): string {
  if (value === null || value === undefined) return "none";
  if (typeof value === "number") {
    if (key.endsWith("_minor") && Number.isSafeInteger(value)) return formatHkd(value);
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((v) => show(key, v)).join(", ");
  return Object.entries(value as Record<string, unknown>).map(([k, v]) => `${k} ${show(k, v)}`).join(", ");
}

/** The probability a listing check compared: `p` (mock engine) or `p_<question>` (core engine). */
export function probabilityOf(rule: Rule): number | undefined {
  const key = Object.keys(rule.inputs).find((k) => k === "p" || k.startsWith("p_"));
  const v = key === undefined ? undefined : rule.inputs[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function thresholdOf(rule: Rule): number | undefined {
  const v = rule.inputs["threshold"];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function RuleRow({ rule }: { readonly rule: Rule }): ReactElement {
  const inputs = Object.entries(rule.inputs).filter(([, v]) => v !== undefined);
  return (
    <li className="run-nerd-rule" data-result={rule.result}>
      <span className="run-nerd-rule__head">
        <code data-ident>{rule.id}{rule.check ? ` ${rule.check}` : ""}</code>
        <span className="run-nerd-rule__result">{rule.result}{rule.verdict ? ` ${rule.verdict}` : ""}</span>
      </span>
      {inputs.length > 0 ? (
        <span className="run-nerd-rule__inputs">
          {inputs.map(([k, v]) => <span key={k} className="run-nerd-kv"><span className="run-nerd-kv__k">{k}</span> <span data-selectable>{show(k, v)}</span></span>)}
        </span>
      ) : null}
      {rule.comparator || rule.threshold_ref ? (
        <span className="run-nerd-rule__cmp">
          {rule.comparator ? <code>{rule.comparator}</code> : null} {rule.threshold_ref ? <code data-ident>{rule.threshold_ref}</code> : null}
        </span>
      ) : null}
    </li>
  );
}

function ListingScores({ decision, prov }: { readonly decision: Decision; readonly prov: Prov }): ReactElement | null {
  const { t } = useLocale();
  const rows = decision.rules.filter((r) => r.id === "R10" && probabilityOf(r) !== undefined);
  if (rows.length === 0) return null;
  return (
    <div className="run-nerd-block">
      <h4 className="run-nerd-block__title">{t(R.listingScores)} <ProvenanceChip prov={prov} /></h4>
      <ul className="run-nerd-scores">
        {rows.map((r, i) => {
          const p = probabilityOf(r) ?? 0;
          const limit = thresholdOf(r);
          return (
            <li key={`${r.check ?? "r10"}-${i}`} className="run-nerd-score" data-result={r.result}>
              <code className="run-nerd-score__name">{r.check ?? "R10"}</code>
              <span className="run-nerd-score__value" data-selectable>{p.toFixed(2)}</span>
              {limit === undefined ? null : <span className="run-nerd-score__limit">{t(R.scoreLimit)} {limit.toFixed(2)} <ProvenanceChip prov={ASSUMED} /></span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const render = (id: string, inputs: Readonly<Record<string, unknown>>, locale: "en" | "zh-HK"): string => coreRender(id as TemplateId, inputs, locale);

export function NerdDetails({ decision, seq }: { readonly decision: Decision; readonly seq: number | undefined }): ReactElement {
  const { t, locale } = useLocale();
  const developer = useIsDeveloper();
  const line = engineLine(decision, locale, render);
  const judge = decision.judge;
  const judgeChip = judgeProv(judge.provider);
  return (
    <details className="run-nerds">
      <summary className="run-nerds__summary">
        <Icon name="list" size={18} /> <span>{t(R.nerds)}</span> <Icon name="chevronRight" size={18} className="run-nerds__chevron" />
      </summary>
      <div className="run-nerds__body">
        {line ? (
          <div className="run-nerd-block">
            <h4 className="run-nerd-block__title">{t(R.engineWrote)}</h4>
            <p className="run-nerd-quote" lang={locale} data-ident>{line}</p>
          </div>
        ) : null}
        <div className="run-nerd-block">
          <h4 className="run-nerd-block__title">{t(R.ruleResults)} <ProvenanceChip prov={cartProv(decision.cart)} /></h4>
          <ol className="run-nerd-rules">
            {decision.rules.map((rule, i) => <RuleRow key={`${rule.id}-${rule.check ?? ""}-${i}`} rule={rule} />)}
          </ol>
        </div>
        <ListingScores decision={decision} prov={judgeChip} />
        <div className="run-nerd-block">
          <h4 className="run-nerd-block__title">{t(R.checker)} <ProvenanceChip prov={judgeChip} /></h4>
          <p className="run-nerd-mono" data-ident>{judge.provider} · {judge.model} · {judge.version} · {judge.status} · {judge.latency_ms} ms</p>
        </div>
        <dl className="run-nerd-ids">
          <div><dt>{t(R.decisionId)}</dt><dd><code data-ident data-selectable>{decision.id}</code></dd></div>
          {/* The number a person reads on Receipts and Home (counted from 1); developer mode keeps the log's own #seq. */}
          {seq === undefined ? null : <div><dt>{t(R.receiptNo)}</dt><dd><code data-ident>{developer ? `#${seq}` : receiptNumber(seq)}</code></dd></div>}
        </dl>
        <a className="run-link" href={receiptHref(decision.id)}>{t(R.seeReceipt)} <Icon name="chevronRight" size={18} /></a>
      </div>
    </details>
  );
}
