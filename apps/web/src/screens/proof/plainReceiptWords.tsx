// Receipts in plain words. A stop or a question is told the way the Wally screen tells it ("It costs HK$550 with shipping,
// but only HK$541 is left in your budget."): picked by the decision's own rule template, figures taken from its recorded
// inputs and each one chipped. The engine's own sentence, with the rule id, moves into "Show the details".
import type { ReactElement, ReactNode } from "react";
import type { Decision, LogEntry } from "../../api/types";
import { NumText } from "../../components/Num";
import { judgeProv, type Prov } from "../../domain/provenance";
import { annotate, figureContext } from "../../explain/figures";
import type { LabelPair } from "../../i18n/label";
import type { Locale } from "../../ui/locale";
import { plainReason } from "../run/model/reason";
import type { Receipt } from "./receipts";
import { amountProv, receiptSummary, STATE_META } from "./receiptWords";

type Rule = Decision["rules"][number];
type T = (text: LabelPair) => string;

/** The decision as if one rule's template were its explanation: lets the Wally screen's words be reused for each failed rule. */
export function reasonDecisionFor(decision: Decision, rule: Rule): Decision {
  if (rule.template_id === undefined) return decision;
  return { ...decision, explanation: { template_id: rule.template_id, inputs: { ...rule.inputs, verdict: rule.verdict }, rendered: "" } };
}

/** The plain reason for a decision, its figures matched to the recorded inputs so each one carries its own chip. */
export function PlainReason({ decision, prov, locale, api }: { readonly decision: Decision; readonly prov: Prov; readonly locale: Locale; readonly api: string }): ReactElement {
  const words = plainReason(decision);
  const text = locale === "zh-HK" ? words.zh : words.en;
  // The cart total and what was left are the figures the plain sentences fall back on when an input was not recorded.
  const inputs = { total_minor: decision.cart.total_minor, remaining_minor: decision.packet.remaining_minor, ...(decision.explanation?.inputs ?? {}) };
  const ctx = figureContext({ api: api === "mock" ? "mock" : "http", money: prov, judge: judgeProv(decision.judge.provider) });
  return (
    <>
      {annotate(text, inputs, ctx).map((s, i) => (s.figure ? <NumText key={i} text={s.text} prov={s.prov} chip="scope" /> : <span key={i}>{s.text}</span>))}
    </>
  );
}

/** One-sentence summary for the detail sheet in plain mode: a stop or a question in the Wally screen's words, the rest as before. */
export function plainSummary(r: Receipt, entry: LogEntry, t: T, locale: Locale, api: string): ReactNode {
  if (r.state !== "stopped" && r.state !== "needsOk") return receiptSummary(r, entry, t, locale, api);
  if (entry.kind !== "DECISION" || !entry.payload.explanation) return t(STATE_META[r.state].label);
  return <PlainReason decision={entry.payload} prov={amountProv(r)} locale={locale} api={api} />;
}
