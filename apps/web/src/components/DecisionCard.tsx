// DecisionCard (docs/04, LEDGER): rule id, inputs, comparator, judge probabilities, outcome. Template text only.
import type { ReactElement } from "react";
import type { Decision, JudgeRecord } from "../api/types";
import { judgeProv, type Prov } from "../domain/provenance";
import { inputFigure, type FigureContext } from "../explain/figures";
import { ruleIdOf } from "../explain/renderStop";
import { S } from "../i18n/strings";
import { Bi } from "./Bi";
import { ChipScope } from "./ChipScope";
import { NumText, Num } from "./Num";
import { StateBadge } from "./StateBadge";

export interface DecisionCardProps {
  readonly decision: Decision;
  readonly ctx: FigureContext;
  readonly latencyProv: Prov;
}

type Rule = Decision["rules"][number];

function Inputs({ rule, ctx }: { readonly rule: Rule; readonly ctx: FigureContext }): ReactElement {
  return (
    <span className="decision__inputs">
      {Object.entries(rule.inputs).map(([key, value]) => {
        const fig = inputFigure(key, value, ctx);
        const shown = fig ? <NumText text={fig.text} prov={fig.prov} chip="scope" /> : <span className="mono" data-ident>{typeof value === "string" ? value : JSON.stringify(value)}</span>;
        return (
          <span className="decision__kv" key={key}>
            <span className="soft">{key.replace(/_minor$/, "").replaceAll("_", " ")}</span> {shown}
          </span>
        );
      })}
    </span>
  );
}

function RuleRow({ rule, ctx }: { readonly rule: Rule; readonly ctx: FigureContext }): ReactElement {
  return (
    <li className={`decision__rule decision__rule--${rule.result.toLowerCase()}`}>
      <span className="decision__rid" data-ident>{rule.id}</span>
      <span className="decision__res">
        {rule.result}
        {rule.verdict ? <> <span data-ident>{rule.verdict}</span></> : null}
      </span>
      {rule.check ? <span className="mono soft" data-ident>{rule.check}</span> : null}
      <Inputs rule={rule} ctx={ctx} />
      {rule.comparator ? <code className="decision__cmp" data-ident>{rule.comparator}</code> : null}
      {rule.threshold_ref ? <code className="soft" data-ident>{rule.threshold_ref}</code> : null}
    </li>
  );
}

function Judge({ judge, latencyProv }: { readonly judge: JudgeRecord; readonly latencyProv: Prov }): ReactElement {
  const prov = judgeProv(judge.provider);
  const a = judge.answers;
  return (
    <section className="decision__judge" aria-label="Judge">
      <ChipScope provs={[prov]}>
        <h4><Bi text={S.judgeTitle} /></h4>
        <p className="mono" data-ident>{judge.provider} · {judge.model} · {judge.version}</p>
        {judge.status !== "OK" ? (
          <StateBadge tone="escalated" text={`JUDGE ${judge.status}`} />
        ) : null}
        {a ? (
          <ul className="decision__answers">
            {Object.entries(a).map(([question, options]) => (
              <li key={question}>
                <span className="mono" data-ident>{question}</span>{" "}
                {Object.entries(options).map(([option, p]) => (
                  <span className="decision__kv" key={option}><span className="soft">{option}</span> <Num kind="prob" value={p as number} prov={prov} chip="scope" /></span>
                ))}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="soft">
          latency <Num kind="ms" value={judge.latency_ms} prov={latencyProv} />
        </p>
      </ChipScope>
    </section>
  );
}

export function DecisionCard({ decision, ctx, latencyProv }: DecisionCardProps): ReactElement {
  const templateId = decision.explanation?.template_id;
  const rid = templateId ? ruleIdOf(templateId) : undefined;
  const shown = decision.rules.filter((r) => r.result !== "SKIPPED");
  const skipped = decision.rules.filter((r) => r.result === "SKIPPED").map((r) => r.id);
  return (
    <section className="card decision-card" data-register="ledger" data-outcome={decision.outcome} aria-label="Decision">
      <header className="decision__head">
        <h3><Bi text={S.decisionTitle} /></h3>
        {decision.outcome === "APPROVE" ? <StateBadge tone="minted" text="APPROVED" zh="已批准" /> : null}
        {decision.outcome === "DENY" ? <StateBadge tone="stopped" text="STOPPED" {...(rid ? { ruleId: rid } : {})} zh="已攔截" /> : null}
        {decision.outcome === "ESCALATE" ? <StateBadge tone="escalated" text="ESCALATED" {...(rid ? { ruleId: rid } : {})} zh="待確認" /> : null}
        {templateId ? <code className="soft" data-ident>{templateId}</code> : null}
      </header>
      <ChipScope provs={[ctx.money]}>
        <h4><Bi text={S.rulesTitle} /></h4>
        <ol className="decision__rules">
          {shown.map((rule, i) => (
            <RuleRow key={`${rule.id}-${rule.check ?? i}`} rule={rule} ctx={ctx} />
          ))}
        </ol>
      </ChipScope>
      {skipped.length > 0 ? <p className="soft">Skipped: <span data-ident>{skipped.join(", ")}</span></p> : null}
      <Judge judge={decision.judge} latencyProv={latencyProv} />
      <p className="soft mono" data-ident>{decision.engine.version}</p>
    </section>
  );
}
