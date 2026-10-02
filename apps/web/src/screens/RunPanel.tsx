// Run (docs/04 Screens): LEDGER under a PACKET header. Lanes planner, judge, engine, rail; CartCard in, DecisionCard out,
// StopBanner pinned above. Latency chips follow the client (SIMULATED in the mock, MEASURED(n=1) when live).
import { useEffect, useRef, type ReactElement } from "react";
import { CartCard } from "../components/CartCard";
import { CardTicket } from "../components/CardTicket";
import { DecisionCard } from "../components/DecisionCard";
import { RailBeats } from "../components/RailBeats";
import { RunTrace } from "../components/RunTrace";
import { StateBadge } from "../components/StateBadge";
import { StopBanner } from "../components/StopBanner";
import { Bi } from "../components/Bi";
import { cartProv, judgeProv, latencyProv, SIMULATED } from "../domain/provenance";
import { Num } from "../components/Num";
import { Disclosure } from "../components/Disclosure";
import { label } from "../i18n/label";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useWide } from "../hooks/useWide";
import { figureContext } from "../explain/figures";
import { useBoothContext } from "../hooks/useBooth";
import { S } from "../i18n/strings";
import { currentDecision, currentRun, type RunView } from "../state/booth";

const CART_FOLD = label("Cart the engine checked", "規則引擎檢查的購物車");
const DECISION_FOLD = label("Decision details: rules, inputs, judge", "決定詳情：規則、輸入、判斷器");

function useRunContext(run: RunView | undefined) {
  const { info } = useBoothContext();
  const api = info?.kind ?? "mock";
  const money = run?.cart ? cartProv(run.cart) : SIMULATED;
  const judge = run?.judge ? judgeProv(run.judge.provider) : SIMULATED;
  return { ctx: figureContext({ api, money, judge }), money, latency: latencyProv(api) };
}

function Banner({ run }: { readonly run: RunView }): ReactElement | null {
  const { ctx } = useRunContext(run);
  const decision = currentDecision(run);
  const template = decision?.explanation?.template_id;
  if (run.outcome === "ERROR") {
    return (
      <section role="alert" className="stop-banner stop-banner--stopped" data-register="ledger">
        <span className="stop-banner__body"><StateBadge tone="stopped" text="STOPPED" zh="已攔截" /><p>{run.note ?? "The run failed before any card was minted."}</p></span>
      </section>
    );
  }
  if (!decision || !template || decision.outcome === "APPROVE") return null;
  return <StopBanner templateId={template} inputs={decision.explanation?.inputs ?? {}} outcome={decision.outcome} ctx={ctx} />;
}

/** APPROVE: the engine said yes and the rail minted a one-off card whose limit equals the cart total (I2). */
function ApprovedNote({ run }: { readonly run: RunView }): ReactElement | null {
  const { money } = useRunContext(run);
  const decision = currentDecision(run);
  if (!decision || decision.outcome !== "APPROVE" || decision.approved_limit_minor === undefined) return null;
  return (
    <section role="status" className="approved" data-register="ledger" data-outcome="APPROVE">
      <StateBadge tone="minted" text="APPROVED" zh="已批准" />
      <p>
        <span lang="en">{S.mintedNote.en}</span> <Num kind="money" value={decision.approved_limit_minor} prov={money} />
      </p>
      <p lang="zh-HK">{S.mintedNote.zh}</p>
    </section>
  );
}

export function RunPanel(): ReactElement {
  const { state, info } = useBoothContext();
  const run = currentRun(state);
  const { ctx, money, latency } = useRunContext(run);
  const decision = currentDecision(run);
  const card = run?.mintedCard ? (state.cards.find((c) => c.id === run.mintedCard?.id) ?? run.mintedCard) : undefined;
  const top = useRef<HTMLElement | null>(null);
  const reduced = useReducedMotion();
  const wide = useWide();
  const runId = run?.runId;
  const decisionId = decision?.id;
  useEffect(() => {
    // On a phone, keep the result above the fold after a press when it is out of sight (docs/04 Phone: StopBanner above
    // the fold). Wide screens show every panel at once, so they never scroll by themselves.
    const el = top.current;
    if (wide || !runId || !el || typeof el.scrollIntoView !== "function") return;
    if (el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
  }, [runId, decisionId, reduced, wide]);
  return (
    <section ref={top} className="run" data-register="ledger" aria-label="Run" aria-live="off">
      {run ? <Banner run={run} /> : null}
      {run ? <ApprovedNote run={run} /> : null}
      {(run?.outcome === "INFO" || run?.outcome === "ESCALATE") && run.note ? <p role="status" className="run__info">{run.note}</p> : null}
      {run ? <RailBeats events={run.cardEvents} /> : null}
      <RunTrace run={run} info={info} latencyProv={latency} />
      {run?.cart ? <Disclosure id="cart" title={CART_FOLD}><CartCard cart={run.cart} prov={money} /></Disclosure> : null}
      {run?.listingText ? (
        <details className="run__listing">
          <summary><Bi text={S.listingTitle} /></summary>
          <blockquote data-ident>{run.listingText}</blockquote>
        </details>
      ) : null}
      {decision ? <Disclosure id="decision" title={DECISION_FOLD}><DecisionCard decision={decision} ctx={ctx} latencyProv={latency} /></Disclosure> : null}
      {card ? <CardTicket card={card} /> : null}
    </section>
  );
}
