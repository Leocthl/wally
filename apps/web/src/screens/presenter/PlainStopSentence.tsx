// The big screen's reason for a stop or a question in plain words (the default display mode): the same sentence the Wally
// screen gives, picked by the decision's own template, with every figure in it chipped. The engine's sentence, with the
// rule id and the probabilities, is what developer mode keeps showing (StageViews.tsx). Words come from templates and
// recorded inputs only; nothing is written by a model.
import type { ReactElement, ReactNode } from "react";
import type { Decision } from "../../api/types";
import { NumText } from "../../components/Num";
import { judgeProv, type Prov } from "../../domain/provenance";
import { useBoth } from "../../evidence/components/Tx";
import { annotate, figureContext, type FigureContext } from "../../explain/figures";
import { useLocale } from "../../ui/locale";
import { plainReason } from "../run/model/reason";

function chipped(text: string, inputs: Readonly<Record<string, unknown>>, ctx: FigureContext): ReactNode {
  return annotate(text, inputs, ctx).map((s, i) => (s.figure ? <NumText key={i} text={s.text} prov={s.prov} chip="scope" /> : <span key={i}>{s.text}</span>));
}

export function PlainStopSentence({ decision, prov, api }: { readonly decision: Decision; readonly prov: Prov; readonly api: string }): ReactElement {
  const { locale } = useLocale();
  const both = useBoth();
  const words = plainReason(decision);
  const inputs = decision.explanation?.inputs ?? {};
  const ctx = figureContext({ api: api === "mock" ? "mock" : "http", money: prov, judge: judgeProv(decision.judge.provider) });
  if (!both) return <span lang={locale === "zh-HK" ? "zh-HK" : undefined}>{chipped(locale === "zh-HK" ? words.zh : words.en, inputs, ctx)}</span>;
  return (
    <span className="tx-both">
      <span lang="en" className="tx-both__en">{chipped(words.en, inputs, ctx)}</span>
      <span lang="zh-HK" className="tx-both__zh">{chipped(words.zh, inputs, ctx)}</span>
    </span>
  );
}
