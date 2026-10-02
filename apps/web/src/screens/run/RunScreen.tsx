// #/wally: Wally's workspace. Idle with an invitation and recent purchases; Wally shopping (the four steps, live); then
// the result the engine decided: approved (one-off card), stopped before paying, or needs your OK, with a "Why?" sheet.
// Everything is a pure view of the TraceEvent state (selectScreen); #/wally?d=<decisionId> pins one purchase.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type RefObject } from "react";
import { useBoothContext } from "../../hooks/useBooth";
import { UI } from "../../i18n/ui";
import { ASK_EVENT } from "../../shell/askEvent";
import { haptic, type HapticKind } from "../../ui/haptics";
import { useLocale } from "../../ui/locale";
import { TopBar } from "../../ui/Nav";
import { Wally } from "../../wally/Wally";
import { Approved } from "./components/Approved";
import { Calm } from "./components/Calm";
import { History } from "./components/History";
import { NeedsOk } from "./components/NeedsOk";
import { Progress } from "./components/Progress";
import { RepeatNote } from "./components/RepeatNote";
import { Stopped } from "./components/Stopped";
import { WhySheet } from "./components/WhySheet";
import { logSeqOf } from "./model/chain";
import { itemTitle, shopName } from "./model/item";
import { currentRun, type BoothState } from "../../state/booth";
import { knownDecisions } from "./model/chain";
import { history, pinnedChain, selectScreen, type Pin, type Result, type ScreenModel } from "./model/screen";
import { useDecisionParam } from "./useDecisionParam";
import "./run.css";

const R = UI.run;
const HISTORY_ROWS = 3;

/** Fired when the screen has no onAsk prop: the shell opens its Ask sheet on this window event (shell/askEvent.ts). */
export { ASK_EVENT };

const HAPTIC: Readonly<Partial<Record<Result["kind"], HapticKind>>> = { approved: "success", stopped: "stop", needsOk: "warning", error: "stop" };

/**
 * The result that just arrived on screen (from Wally shopping, or a question that was answered or ran out), so its
 * motion, haptic and focus move happen once. Set in a layout effect so the first painted frame already has it.
 */
function useFreshResult(model: ScreenModel): string | null {
  const seen = useRef<{ readonly working: string | null; readonly id: string | null }>({ working: null, id: null });
  const [fresh, setFresh] = useState<string | null>(null);
  useLayoutEffect(() => {
    const prev = seen.current;
    if (model.kind === "working") {
      seen.current = { working: model.run.runId, id: "working" };
      return;
    }
    const id = model.kind === "result" ? `${model.result.key}:${model.result.kind}` : "idle";
    if (id === prev.id) return;
    if (model.kind === "result") {
      const r = model.result;
      const fromWorking = prev.id === "working" && (r.run?.runId === prev.working || r.key === prev.working);
      const answered = prev.id === `${r.key}:needsOk`;
      if (fromWorking || answered) setFresh(id);
    }
    seen.current = { working: prev.working, id };
  });
  return fresh;
}

/**
 * The purchase pinned by #/wally?d=<id>, with the run that was the latest when it was pinned: a run started after
 * that, about something else, takes the screen over and the query is dropped, so the same row can pin it again.
 */
function usePin(state: BoothState): { readonly pin: Pin | undefined; readonly pinned: boolean } {
  const [param, clearParam] = useDecisionParam();
  const latest = currentRun(state)?.runId;
  const make = (id: string | undefined): Pin | undefined => (id === undefined ? undefined : { id, ...(latest === undefined ? {} : { afterRun: latest }) });
  const [pin, setPin] = useState<Pin | undefined>(() => make(param));
  const [seen, setSeen] = useState(param);
  if (seen !== param) {
    setSeen(param);
    setPin(make(param));
  }
  const known = pin !== undefined && knownDecisions(state).some((d) => d.id === pin.id);
  const superseded = known && pinnedChain(state, pin) === undefined;
  useEffect(() => {
    if (!superseded) return;
    clearParam();
    setPin(undefined);
  }, [superseded, clearParam]);
  return { pin: superseded ? undefined : pin, pinned: pin !== undefined && !superseded };
}

export interface RunScreenProps {
  /** Opens the shell's Ask sheet. Without it, the screen dispatches ASK_EVENT on window. */
  readonly onAsk?: () => void;
  /** Clock for the answer countdown (tests). */
  readonly now?: () => number;
}

export function RunScreen({ onAsk, now }: RunScreenProps = {}): ReactElement {
  const booth = useBoothContext();
  const { t, locale } = useLocale();
  const { pin, pinned } = usePin(booth.state);
  const model = selectScreen(booth.state, pin);
  const fresh = useFreshResult(model);
  const heading = useRef<HTMLHeadingElement>(null);
  const [why, setWhy] = useState(false);
  const [paying, setPaying] = useState(false);
  const [answering, setAnswering] = useState<"APPROVE" | "DENY" | null>(null);

  const result = model.kind === "result" ? model.result : undefined;
  const freshHere = result !== undefined && fresh === `${result.key}:${result.kind}`;

  useEffect(() => {
    if (!fresh || !result || fresh !== `${result.key}:${result.kind}`) return;
    heading.current?.focus({ preventScroll: false });
    const kind = HAPTIC[result.kind];
    if (kind) haptic(kind);
    // Runs once per fresh result: `fresh` already names its key and kind.
  }, [fresh]);

  useEffect(() => setWhy(false), [result?.key]);

  const ask = useCallback(() => (onAsk ? onAsk() : window.dispatchEvent(new CustomEvent(ASK_EVENT))), [onAsk]);
  const pay = useCallback(() => {
    setPaying(true);
    void booth.runScenario("pay").finally(() => setPaying(false));
  }, [booth]);
  const answer = useCallback(
    (choice: "APPROVE" | "DENY") => {
      const id = result?.escalation?.decisionId;
      if (!id) return;
      setAnswering(choice);
      void booth.answer(id, choice).finally(() => setAnswering(null));
    },
    [booth, result?.escalation?.decisionId],
  );
  // "See cheaper options" needs the booth to offer it (info.features.alternatives) and the client to implement it.
  const suggest = booth.info?.features.alternatives === true ? booth.api.suggestAlternatives : undefined;
  const decisionId = result?.chain?.current.id;
  const cheaper = suggest && decisionId ? () => void booth.exec(() => suggest.call(booth.api, { decisionId })) : undefined;
  // The "pay" button pays the newest open card, so Pay now is offered only on the screen of that card.
  const newestOpen = booth.state.cards.filter((c) => c.state === "ACTIVE").at(-1);
  const canPay = result?.card !== undefined && newestOpen?.id === result.card.id;
  const topUp = useCallback(() => {
    window.location.hash = "#/seal";
  }, []);
  const back = useCallback(() => window.history.back(), []);

  return (
    <div className="run-screen" lang={locale} data-screen="wally">
      <Bar model={model} pinned={pinned} onBack={back} />
      <div className="run-body">
        {model.kind === "idle" ? <Calm kind="idle" onAsk={ask} /> : null}
        {model.kind === "working" ? <Progress run={model.run} info={booth.info} /> : null}
        {result?.repeat ? <RepeatNote kind={result.kind} /> : null}
        {result ? (
          <ResultView
            result={result}
            fresh={freshHere}
            heading={heading}
            packet={booth.state.packet}
            paying={paying}
            canPay={canPay}
            answering={answering}
            onAsk={ask}
            onPay={pay}
            onAnswer={answer}
            onWhy={() => setWhy(true)}
            onTopUp={topUp}
            {...(cheaper ? { onCheaper: cheaper } : {})}
            {...(now ? { now } : {})}
          />
        ) : null}
        <History rows={history(booth.state, HISTORY_ROWS, result?.key)} title={model.kind === "idle" ? R.recent : R.earlier} />
      </div>
      {result?.chain ? <WhySheet open={why} onClose={() => setWhy(false)} chain={result.chain} seq={logSeqOf(booth.state, result.chain.current.id)} /> : null}
      <span className="sr-only">{t(UI.simulated)}</span>
    </div>
  );
}

function Bar({ model, pinned, onBack }: { readonly model: ScreenModel; readonly pinned: boolean; readonly onBack: () => void }): ReactElement {
  const { t } = useLocale();
  if (model.kind === "working") {
    return <TopBar title={t(UI.wallyThinking)} subtitle={t(R.forYourBudget)} leading={<Wally state="thinking" size={40} decorative />} />;
  }
  const cart = model.kind === "result" ? model.result.chain?.current.cart : undefined;
  if (cart) return <TopBar title={itemTitle(cart)} subtitle={shopName(cart)} {...(pinned ? { onBack } : {})} />;
  return <TopBar large title={t(R.title)} subtitle={t(R.subtitle)} />;
}

interface ResultViewProps {
  readonly result: Result;
  readonly fresh: boolean;
  readonly heading: RefObject<HTMLHeadingElement | null>;
  readonly packet: ReturnType<typeof useBoothContext>["state"]["packet"];
  readonly paying: boolean;
  readonly canPay: boolean;
  readonly answering: "APPROVE" | "DENY" | null;
  readonly onAsk: () => void;
  readonly onPay: () => void;
  readonly onAnswer: (choice: "APPROVE" | "DENY") => void;
  readonly onWhy: () => void;
  readonly onTopUp: () => void;
  readonly onCheaper?: () => void;
  readonly now?: () => number;
}

function ResultView(p: ResultViewProps): ReactElement {
  const { result } = p;
  switch (result.kind) {
    case "approved":
      return <Approved result={result} packet={p.packet} fresh={p.fresh} headingRef={p.heading} paying={p.paying} canPay={p.canPay} onPay={p.onPay} onWhy={p.onWhy} />;
    case "stopped":
      return <Stopped result={result} fresh={p.fresh} headingRef={p.heading} onWhy={p.onWhy} onTopUp={p.onTopUp} onAsk={p.onAsk} {...(p.onCheaper ? { onCheaper: p.onCheaper } : {})} />;
    case "needsOk":
      return <NeedsOk result={result} headingRef={p.heading} answering={p.answering} onAnswer={p.onAnswer} onWhy={p.onWhy} {...(p.now ? { now: p.now } : {})} />;
    case "noPick":
    case "error":
    case "info":
      return <Calm kind={result.kind} code={result.code} onAsk={p.onAsk} headingRef={p.heading} />;
  }
}
