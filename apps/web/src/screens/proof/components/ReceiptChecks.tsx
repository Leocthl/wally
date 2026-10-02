// What Wally checked, in words: one line per rule that ran, passed or stopped here. A failing rule says why from its
// template and recorded inputs. Rule ids, thresholds and judge probabilities wait behind "Details".
import type { ReactElement } from "react";
import type { Decision } from "../../../api/types";
import { ChipScope } from "../../../components/ChipScope";
import { Num, NumText } from "../../../components/Num";
import { judgeProv, latencyProv, type Prov } from "../../../domain/provenance";
import { figureContext, inputFigure } from "../../../explain/figures";
import type { LabelPair } from "../../../i18n/label";
import { UI } from "../../../i18n/ui";
import { cx } from "../../../ui/cx";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { TemplateSentence } from "../receiptWords";

const R = UI.receipts;
type Rule = Decision["rules"][number];

const R10_WORDS: Readonly<Record<string, LabelPair>> = {
  scope_fit: R.rules.R10scope,
  injection_risk: R.rules.R10injection,
  seller_risk: R.rules.R10seller,
  escalate_or_proceed: R.rules.R10escalate,
};

export function ruleWords(rule: Rule): LabelPair {
  if (rule.id === "R10") return R10_WORDS[rule.check ?? ""] ?? R.rules.R10;
  if (rule.id === "R9" && rule.result === "PASS" && rule.inputs["state"] === "NO_RECORD") return R.rules.R9NoRecord;
  return R.rules[rule.id];
}

type Status = "pass" | "stop" | "ask";

function statusOf(rule: Rule): Status {
  if (rule.result !== "FAIL") return "pass";
  return rule.verdict === "ESCALATE" ? "ask" : "stop";
}

const STATUS = {
  pass: { icon: "check", words: R.checkPass },
  stop: { icon: "hand", words: R.checkStop },
  ask: { icon: "clock", words: R.checkAsk },
} as const;

export function ReceiptChecks({ decision, prov, api }: { readonly decision: Decision; readonly prov: Prov; readonly api: string }): ReactElement {
  const { t, locale } = useLocale();
  const ran = decision.rules.filter((r) => r.result !== "SKIPPED");
  return (
    <section className="rc-section" aria-labelledby="rc-checks-title">
      <h3 id="rc-checks-title" className="rc-section__title">{t(R.checksTitle)}</h3>
      <ul className="rc-checks">
        {ran.map((rule, i) => {
          const status = statusOf(rule);
          const s = STATUS[status];
          return (
            <li key={`${rule.id}-${rule.check ?? i}`} className={cx("rc-check", `rc-check--${status}`)} data-rule={rule.id} data-result={rule.result}>
              <span className="rc-check__icon"><Icon name={s.icon} size={16} strokeWidth={2.6} /></span>
              <span className="rc-check__text">
                <span className="rc-check__name">{t(ruleWords(rule))}</span>
                {status !== "pass" && rule.template_id ? (
                  <span className="rc-check__why"><TemplateSentence templateId={rule.template_id} inputs={{ ...rule.inputs, verdict: rule.verdict }} locale={locale} prov={prov} judge={decision.judge.provider} api={api} /></span>
                ) : null}
              </span>
              <span className="rc-check__status">{t(s.words)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RuleDetail({ rule, prov, judge, api }: { readonly rule: Rule; readonly prov: Prov; readonly judge: string; readonly api: string }): ReactElement {
  const ctx = figureContext({ api: api === "mock" ? "mock" : "http", money: prov, judge: judgeProv(judge) });
  return (
    <li className="rc-detail">
      <span className="rc-detail__head mono" data-ident>{rule.id}{rule.check ? ` ${rule.check}` : ""} · {rule.result}{rule.verdict ? ` ${rule.verdict}` : ""}{rule.comparator ? ` ${rule.comparator}` : ""}{rule.threshold_ref ? ` ${rule.threshold_ref}` : ""}</span>
      <span className="rc-detail__inputs">
        {Object.entries(rule.inputs).map(([key, value]) => {
          const fig = inputFigure(key, value, ctx);
          return (
            <span key={key} className="rc-detail__kv">
              <span className="mono soft" data-ident>{key}</span>{" "}
              {fig ? <NumText text={fig.text} prov={fig.prov} chip="scope" /> : <span className="mono" data-ident>{typeof value === "string" ? value : JSON.stringify(value)}</span>}
            </span>
          );
        })}
      </span>
    </li>
  );
}

/** Rule ids, inputs and the judge record, for the curious. Figures keep their chips (one shared chip in the header). */
export function DecisionDetails({ decision, prov, api }: { readonly decision: Decision; readonly prov: Prov; readonly api: string }): ReactElement {
  const judge = decision.judge;
  return (
    <ChipScope provs={[prov]} className="rc-details">
      <ul className="rc-details__rules">
        {decision.rules.map((rule, i) => <RuleDetail key={`${rule.id}-${rule.check ?? i}`} rule={rule} prov={prov} judge={judge.provider} api={api} />)}
      </ul>
      <p className="rc-details__judge">
        <span className="mono" data-ident>{judge.provider} · {judge.model} · {judge.version} · {judge.status}</span>{" "}
        <Num kind="ms" value={judge.latency_ms} prov={judge.provider === "replay" ? judgeProv("replay") : latencyProv(api === "mock" ? "mock" : "http")} />
      </p>
      <p className="mono soft" data-ident>{decision.engine.version} · {decision.engine.config_sha256.slice(0, 12)}</p>
    </ChipScope>
  );
}
