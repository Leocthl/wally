// The quiet states: idle (Wally ready, one invitation), no clear pick, an error, or a step that only reused an earlier
// card. One title, one line, one action; nothing alarming, and never a blank screen. Two dead ends lead somewhere: with no
// cheaper option found it says what was tried and offers a new amount or something else; with the budget cancelled or ended
// the one way on is a new budget, not another ask.
import type { ReactElement, Ref } from "react";
import { SIMULATED } from "../../../domain/provenance";
import type { LabelPair } from "../../../i18n/label";
import { UI } from "../../../i18n/ui";
import { Button } from "../../../ui/Button";
import { ProvenanceChip } from "../../../ui/Chip";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { Wally, type WallyState } from "../../../wally/Wally";
import { Fill, Money } from "../../../shell/figures";
import { useAskEcho } from "../askEcho";
import type { CheaperTried } from "../model/cheaper";
import type { ClosedBudget } from "../model/closed";
import { AskBubble } from "./AskBubble";

const R = UI.run;
const NO_CHEAPER = "NO_PROPOSAL:no_alternative";

export type CalmKind = "idle" | "noPick" | "error" | "info";

const COPY: Readonly<Record<CalmKind, { readonly title: LabelPair; readonly body: LabelPair; readonly wally: WallyState }>> = {
  idle: { title: R.idleTitle, body: R.idleBody, wally: "idle" },
  noPick: { title: R.noPickTitle, body: R.noPickBody, wally: "thinking" },
  error: { title: R.errorTitle, body: R.errorBody, wally: "offline" },
  info: { title: R.infoTitle, body: R.infoBody, wally: "idle" },
};

/** Runs that ended for a known reason say it: a typed ask this device has no recording for, or no cheaper pick. */
function copyFor(kind: CalmKind, code: string | undefined, closed: ClosedBudget | null): { readonly title: LabelPair; readonly body: LabelPair; readonly wally: WallyState } {
  // A budget that is over has nothing to be ready for: say so, in the words Home uses for it.
  if (closed !== null && kind === "idle") return { title: UI[closed === "ended" ? "home.endedTitle" : "home.cancelledTitle"], body: UI["home.cancelledBody"], wally: "idle" };
  if (code === "UNKNOWN_REQUEST" || code === "ON_DEVICE_UNKNOWN_REQUEST") return { title: R.unknownAskTitle, body: R.unknownAskBody, wally: "thinking" };
  if (code === NO_CHEAPER) return { title: R.noCheaperTitle, body: R.noCheaperBody, wally: "thinking" };
  return COPY[kind];
}

/** What the person asked, still on screen when Wally could not pick (so the miss reads as an answer to those words). */
function AskedEcho({ runId }: { readonly runId: string }): ReactElement | null {
  const asked = useAskEcho(runId);
  return asked ? <AskBubble text={asked} still /> : null;
}

export interface CalmProps {
  readonly kind: CalmKind;
  readonly code?: string | undefined;
  readonly runId?: string | undefined;
  readonly onAsk: () => void;
  readonly headingRef?: Ref<HTMLHeadingElement>;
  /** The budget is cancelled or ended: the action becomes a new budget. */
  readonly closed?: ClosedBudget | null;
  readonly onNewBudget?: () => void;
  /** What a search for something cheaper tried, for the "No cheaper option fits" screen. */
  readonly tried?: CheaperTried | null;
  /** Opens the amount to change it (a top up, which is a new budget with a bigger amount). */
  readonly onChangeAmount?: () => void;
}

export function Calm({ kind, code, runId, onAsk, headingRef, closed = null, onNewBudget, tried = null, onChangeAmount }: CalmProps): ReactElement {
  const { t } = useLocale();
  const copy = copyFor(kind, code, closed);
  const noCheaper = code === NO_CHEAPER && closed === null;
  return (
    <>
      {runId !== undefined && kind !== "idle" ? <AskedEcho runId={runId} /> : null}
      <section className="run-calm" data-run-state={kind} role={kind === "error" ? "alert" : undefined}>
        <Wally state={copy.wally} size={kind === "idle" ? 132 : 112} decorative />
        <h2 className="run-calm__title" tabIndex={-1} ref={headingRef}>{t(copy.title)}</h2>
        {noCheaper && tried !== null ? (
          <p className="run-calm__body" data-tried>
            <Fill text={t(R.noCheaperTried)} slots={{ item: tried.item, left: <Money minor={tried.leftMinor} prov={SIMULATED} /> }} /> <ProvenanceChip prov={SIMULATED} />
          </p>
        ) : (
          <p className="run-calm__body">{t(copy.body)}</p>
        )}
        {closed !== null && onNewBudget ? (
          <Button size="lg" onClick={onNewBudget} icon={<Icon name="plus" size={20} />} className="run-calm__action" data-new-budget>{t(UI["home.newBudget"])}</Button>
        ) : noCheaper && onChangeAmount ? (
          <>
            <Button size="lg" onClick={onChangeAmount} icon={<Icon name="plus" size={20} />} className="run-calm__action" data-change-amount>{t(R.changeAmount)}</Button>
            <Button size="lg" variant="secondary" onClick={onAsk} icon={<Icon name="sparkle" size={20} />} className="run-calm__action">{t(R.pickElse)}</Button>
          </>
        ) : (
          <Button size="lg" onClick={onAsk} icon={<Icon name="sparkle" size={20} />} className="run-calm__action">{t(R.ask)}</Button>
        )}
      </section>
    </>
  );
}
