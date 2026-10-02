// StopBanner (docs/04): full width, role="alert", sentence from the rule template plus recorded inputs; colour, icon and
// text say STOPPED or ESCALATED with the rule id. Never LLM prose. Figures wear chips (one shared chip when one provenance).
import type { ReactElement } from "react";
import type { Render, TemplateId } from "@laisee/core/ports";
import { chipText, type Prov } from "../domain/provenance";
import { annotate, type FigureContext, type Segment } from "../explain/figures";
import { renderStop, ruleIdOf } from "../explain/renderStop";
import { ChipScope } from "./ChipScope";
import { IconEscalated, IconStopped } from "./icons";
import { NumText } from "./Num";

export interface StopBannerProps {
  readonly templateId: TemplateId;
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly outcome: "DENY" | "ESCALATE";
  readonly ctx: FigureContext;
  /** Defaults to the stub-backed renderStop. Lane A's `render` fits this type. */
  readonly render?: Render;
}

function distinctProvs(segments: readonly Segment[]): readonly Prov[] {
  const seen = new Map<string, Prov>();
  for (const s of segments) if (s.figure) seen.set(chipText(s.prov), s.prov);
  return [...seen.values()];
}

function Line({ lang, segments, scoped }: { readonly lang: "en" | "zh-HK"; readonly segments: readonly Segment[]; readonly scoped: boolean }): ReactElement {
  return (
    <p className="stop-banner__text" lang={lang}>
      {segments.map((s, i) => (s.figure ? <NumText key={i} text={s.text} prov={s.prov} chip={scoped ? "scope" : "inline"} /> : <span key={i}>{s.text}</span>))}
    </p>
  );
}

export function StopBanner({ templateId, inputs, outcome, ctx, render = renderStop }: StopBannerProps): ReactElement {
  const rule = ruleIdOf(templateId);
  const stopped = outcome === "DENY";
  const en = annotate(render(templateId, inputs, "en"), inputs, ctx);
  const zh = annotate(render(templateId, inputs, "zh-HK"), inputs, ctx);
  const provs = distinctProvs([...en, ...zh]);
  const scoped = provs.length === 1;
  const body = (
    <>
      <p className="stop-banner__state">
        <strong>{stopped ? "STOPPED" : "ESCALATED"} <span data-ident>{rule}</span></strong>
        <span lang="zh-HK" className="stop-banner__state-zh">{stopped ? "已攔截" : "待確認"} <span data-ident>{rule}</span></span>
      </p>
      <Line lang="en" segments={en} scoped={scoped} />
      <Line lang="zh-HK" segments={zh} scoped={scoped} />
    </>
  );
  return (
    <section
      role="alert"
      className={`stop-banner ${stopped ? "stop-banner--stopped" : "stop-banner--escalated"}`}
      data-register="ledger"
      data-template={templateId}
      data-outcome={outcome}
    >
      <span className="stop-banner__icon">{stopped ? <IconStopped /> : <IconEscalated />}</span>
      <div className="stop-banner__body">{scoped ? <ChipScope provs={provs} place="end">{body}</ChipScope> : body}</div>
    </section>
  );
}
