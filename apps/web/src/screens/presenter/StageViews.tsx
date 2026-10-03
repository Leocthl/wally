// What the big screen shows for each beat: the sealed rules (DM1), the latest run's result with what the rail answered
// (DM2 to DM6), receipts and proof (DM7), and the one real decline in REAL mode. Words come from templates and recorded
// inputs only; every figure wears a chip (one SIMULATED chip per card).
import type { ReactElement, ReactNode } from "react";
import type { CardBeat, CardEvent, Mandate, RealCapture } from "../../api/types";
import { ChipScope } from "../../components/ChipScope";
import { Num, NumText } from "../../components/Num";
import { cartProv, observed, SIMULATED } from "../../domain/provenance";
import { formatHkDateTime } from "../../domain/time";
import { Tx, TxFill, useBoth } from "../../evidence/components/Tx";
import { UI } from "../../i18n/ui";
import { cx } from "../../ui/cx";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { Wally } from "../../wally/Wally";
import { currentDecision, type RunView } from "../../state/booth";
import { useIsDeveloper } from "../../state/displayMode";
import { declineWords, TemplateSentence } from "../proof/receiptWords";
import { PlainStopSentence } from "./PlainStopSentence";

const PU = UI.presenterUi;

export function SealView({ mandate }: { readonly mandate: Mandate }): ReactElement {
  const r = mandate.rules;
  const until = (() => {
    try {
      return formatHkDateTime(mandate.valid_until);
    } catch {
      return "";
    }
  })();
  const money = (minor: number): ReactNode => <Num kind="money" value={minor} prov={SIMULATED} chip="scope" />;
  return (
    <section className="pr-view pr-seal" aria-labelledby="pr-seal-title" data-view="seal">
      <div className="pr-view__head">
        <span className="pr-badge pr-badge--primary"><Icon name="lock" size={34} /></span>
        <h2 id="pr-seal-title" className="pr-view__title"><Tx text={PU.sealedTitle} /></h2>
      </div>
      <Tx as="p" text={PU.sealedBody} className="pr-view__lead" />
      <figure className="pr-seal__quote">
        <figcaption><Tx text={PU.yourWords} /></figcaption>
        <blockquote data-ident>{mandate.intent_text}</blockquote>
      </figure>
      <ChipScope provs={[SIMULATED]} className="pr-seal__rules" chipsClassName="pr-seal__chips">
        <ul className="pr-rules">
          <li><Icon name="wallet" size={26} /><TxFill text={PU.ruleBudget} slots={{ amount: money(r.budget.amount_minor) }} /></li>
          <li><Icon name="tag" size={26} /><span><Tx text={PU.ruleCategories} />: <span className="mono" data-ident>{r.categories.join(", ")}</span></span></li>
          {r.seller_check.require_capture ? <li><Icon name="shieldCheck" size={26} /><Tx text={PU.ruleSellers} /></li> : null}
          {r.per_purchase?.hard_cap_minor !== undefined ? <li><Icon name="card" size={26} /><TxFill text={PU.ruleCap} slots={{ amount: money(r.per_purchase.hard_cap_minor) }} /></li> : null}
          {r.per_purchase?.ask_above_minor !== undefined ? <li><Icon name="clock" size={26} /><TxFill text={PU.ruleAsk} slots={{ amount: money(r.per_purchase.ask_above_minor) }} /></li> : null}
          {until ? <li><Icon name="clock" size={26} /><TxFill text={PU.ruleUntil} slots={{ time: <NumText text={until} prov={SIMULATED} chip="scope" kind="time" /> }} /></li> : null}
        </ul>
      </ChipScope>
    </section>
  );
}

function beatWords(event: CardEvent, beat: CardBeat): ReactNode {
  const amount = event.amount_minor === undefined ? null : <Num kind="money" value={event.amount_minor} prov={SIMULATED} chip="scope" />;
  if (event.event === "DECLINED") {
    return (
      <>
        <Tx text={declineWords(event.decline_code ?? null)} />
        {amount ? <> <TxFill text={PU.beatTried} slots={{ amount }} /></> : null}
      </>
    );
  }
  if (event.event === "AUTHORISED") return <TxFill text={beat === "retry" ? PU.beatRetry : PU.beatPaid} slots={{ amount }} />;
  return <Tx text={event.event === "VOIDED" ? PU.beatVoided : PU.beatExpired} />;
}

/** What the SIMULATED rail answered at checkout. A decline is an alert (the limit held); a charge is a status. */
function Beats({ run }: { readonly run: RunView }): ReactElement | null {
  if (run.cardEvents.length === 0) return null;
  return (
    <section className="pr-beats" aria-labelledby={`pr-beats-${run.runId}`}>
      <h3 id={`pr-beats-${run.runId}`} className="pr-beats__title"><Tx text={PU.atCheckout} /></h3>
      <ChipScope provs={[SIMULATED]} className="pr-beats__scope" chipsClassName="pr-beats__chips">
        <ol className="pr-beats__list">
          {run.cardEvents.map(({ event, beat }, i) => {
            const declined = event.event === "DECLINED";
            return (
              <li key={i} className={cx("pr-beat", `pr-beat--${event.event.toLowerCase()}`)} role={declined ? "alert" : "status"} data-beat={beat} data-event={event.event} {...(event.decline_code ? { "data-decline": event.decline_code } : {})}>
                <span className="pr-beat__icon"><Icon name={declined ? "hand" : event.event === "AUTHORISED" ? "check" : "card"} size={26} /></span>
                <span className="pr-beat__text">{beatWords(event, beat)}</span>
              </li>
            );
          })}
        </ol>
      </ChipScope>
    </section>
  );
}

function TemplateBoth({ templateId, inputs, prov, judge, api }: { readonly templateId: string; readonly inputs: Readonly<Record<string, unknown>>; readonly prov: ReturnType<typeof cartProv>; readonly judge: string; readonly api: string }): ReactElement {
  const { locale } = useLocale();
  const both = useBoth();
  if (!both) return <span lang={locale === "zh-HK" ? "zh-HK" : undefined}><TemplateSentence templateId={templateId} inputs={inputs} locale={locale} prov={prov} judge={judge} api={api} /></span>;
  return (
    <span className="tx-both">
      <span lang="en" className="tx-both__en"><TemplateSentence templateId={templateId} inputs={inputs} locale="en" prov={prov} judge={judge} api={api} /></span>
      <span lang="zh-HK" className="tx-both__zh"><TemplateSentence templateId={templateId} inputs={inputs} locale="zh-HK" prov={prov} judge={judge} api={api} /></span>
    </span>
  );
}

/** The latest run, big: Wally, one plain headline, the reason (the engine's rule sentence in developer mode) or the card, then the rail's answers. */
export function RunResult({ run, api }: { readonly run: RunView | undefined; readonly api: string }): ReactElement {
  const developer = useIsDeveloper();
  if (!run) {
    return (
      <section className="pr-view pr-run pr-run--idle" data-view="run">
        <Wally state="idle" size={140} decorative />
        <Tx as="p" text={PU.ready} className="pr-view__lead" />
      </section>
    );
  }
  const decision = currentDecision(run);
  const prov = run.cart ? cartProv(run.cart) : SIMULATED;
  const failed = run.outcome === "ERROR";
  const outcome = failed ? "ERROR" : (decision?.outcome ?? (run.finished ? "INFO" : "RUNNING"));
  const lastEvent = run.cardEvents.at(-1)?.event.event;
  const wally = outcome === "APPROVE" || (outcome === "INFO" && lastEvent === "AUTHORISED") ? "approved" : outcome === "DENY" || failed || (outcome === "INFO" && lastEvent === "DECLINED") ? "stopped" : outcome === "RUNNING" ? "thinking" : "idle";
  const explanation = decision?.explanation;
  const scope = prov.kind === "SIMULATED" ? [SIMULATED] : [SIMULATED, prov];
  return (
    <section className={cx("pr-view", "pr-run", `pr-run--${outcome.toLowerCase()}`)} data-view="run" data-outcome={outcome}>
      <ChipScope provs={scope} className="pr-run__scope" chipsClassName="pr-run__chips">
        <div className="pr-run__hero">
          <Wally state={wally} size={132} decorative />
          <div className="pr-run__words">
            {outcome === "RUNNING" ? <Tx as="p" text={PU.shopping} className="pr-run__title" /> : null}
            {outcome === "APPROVE" && decision ? (
              <div role="status">
                <Tx as="p" text={PU.madeCard} className="pr-run__title" />
                <TxFill as="p" className="pr-run__sentence" text={PU.exactly} slots={{ amount: <Num kind="money" value={decision.approved_limit_minor ?? decision.cart.total_minor} prov={prov} chip="scope" /> }} />
              </div>
            ) : null}
            {(outcome === "DENY" || outcome === "ESCALATE") && decision ? (
              <div role="alert" className="pr-stop" data-template={explanation?.template_id ?? ""} data-outcome={outcome}>
                <p className="pr-run__title"><Tx text={outcome === "DENY" ? PU.stopped : PU.needsOk} /></p>
                {explanation ? (
                  <p className="pr-run__sentence">
                    {developer ? <TemplateBoth templateId={explanation.template_id} inputs={explanation.inputs} prov={prov} judge={decision.judge.provider} api={api} /> : <PlainStopSentence decision={decision} prov={prov} api={api} />}
                  </p>
                ) : null}
                {outcome === "DENY" ? <Tx as="p" text={PU.noCardMade} className="pr-run__note" /> : null}
              </div>
            ) : null}
            {failed ? <div role="alert" className="pr-stop" data-outcome="ERROR"><Tx as="p" text={PU.failedRun} className="pr-run__title" /></div> : null}
            {outcome === "INFO" && run.note ? <p className="pr-run__note" data-ident>{run.note}</p> : null}
            {decision ? <p className="pr-run__what"><span>{decision.cart.merchant.name}</span> · <span>{decision.cart.items[0].title}</span></p> : null}
          </div>
        </div>
        <Beats run={run} />
      </ChipScope>
    </section>
  );
}

export function RealView({ capture }: { readonly capture: RealCapture }): ReactElement {
  return (
    <section className="pr-view pr-real" aria-labelledby="pr-real-title" data-view="real">
      <h2 id="pr-real-title" className="pr-view__title"><Tx text={PU.realTitle} /></h2>
      <p className="pr-real__code"><Tx text={PU.realCode} /> <code data-ident>{capture.declineCode}</code></p>
      <ChipScope provs={[observed(capture.capturedAt, "data/real-card-test.md")]}><p className="pr-view__lead" data-ident>{capture.note}</p></ChipScope>
      <Tx as="p" text={PU.realNote} className="pr-run__note" />
    </section>
  );
}
