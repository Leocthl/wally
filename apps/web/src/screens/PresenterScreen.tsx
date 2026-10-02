// #/presenter: the finalist stage and the booth's big screen. Full width, the largest type, the rail badge top right, the
// beat in the stage and the budget with its one-off cards beside it, and a sticky PresenterBar. The Driver steps DM1 to
// DM9 (docs/06); Space or Right arrow is the next step, R resets. EN, 繁 or both side by side (this screen only).
import { useEffect, useRef, useState, type ReactElement } from "react";
import { PRESENTER_SCRIPT, type View } from "../booth/presenterScript";
import { PresenterBar, type Mode, type PresenterLang } from "../components/PresenterBar";
import { Dm8View, Dm9Card } from "../evidence/components/PresenterBeats";
import { BothLanguages, Tx } from "../evidence/components/Tx";
import { useBoothContext } from "../hooks/useBooth";
import { S } from "../i18n/strings";
import { UI } from "../i18n/ui";
import { PhoneQr } from "../shell/PhoneQr";
import { Icon } from "../ui/icons";
import { LocaleProvider, useLocale } from "../ui/locale";
import { Wordmark } from "../wally/Wordmark";
import { currentRun } from "../state/booth";
import { BudgetSide } from "./presenter/BudgetSide";
import { ProofStage } from "./presenter/ProofStage";
import { RealView, RunResult, SealView } from "./presenter/StageViews";
import "./presenter/presenter.css";

/** Keys that belong to a control the focus is on (typing, a radio group's arrows, a button's own Space). */
function ownedByFocus(target: EventTarget | null, key: string): boolean {
  const el = target instanceof Element ? target : null;
  if (!el) return false;
  if (el.closest("input, textarea, select, [contenteditable='true']")) return true;
  if (key === "ArrowRight") return el.closest("[role='radio'], [role='tab'], [role='slider']") !== null;
  if (key === " ") return el.closest("button, a[href], summary, [role='radio'], [role='tab']") !== null;
  return false;
}

function useShortcuts(step: () => void, reset: () => void): void {
  const latest = useRef({ step, reset });
  latest.current = { step, reset };
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || ownedByFocus(e.target, e.key)) return;
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        latest.current.step();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        latest.current.reset();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function Stage({ view, mode }: { readonly view: View; readonly mode: Mode }): ReactElement {
  const { state, info, api } = useBoothContext();
  if (mode === "REAL" && info?.realCapture) return <RealView capture={info.realCapture} />;
  if (view === "seal" && state.mandate) return <SealView mandate={state.mandate} />;
  if (view === "log") return <ProofStage />;
  if (view === "deck") return <Tx as="p" text={UI.presenterUi.deck} className="pr-view pr-view__lead" />;
  if (view === "evidence") return <Dm8View />;
  if (view === "limits") return <Dm9Card />;
  return <RunResult run={currentRun(state)} api={api.kind} />;
}

const WIDE_VIEWS: ReadonlySet<View> = new Set(["log", "evidence", "limits"]);

function PresenterBody({ lang, onLang }: { readonly lang: PresenterLang; readonly onLang: (l: PresenterLang) => void }): ReactElement {
  const { t } = useLocale();
  const booth = useBoothContext();
  const { state, busy, info } = booth;
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<Mode>("SIMULATED");
  const [view, setView] = useState<View>("booth");
  const running = useRef(false);

  const step = async (): Promise<void> => {
    const current = PRESENTER_SCRIPT[index];
    if (!current || busy || running.current) return;
    running.current = true;
    try {
      await booth.exec(() => current.run(booth.api));
      setIndex((n) => n + 1);
      setView(current.view);
    } finally {
      running.current = false;
    }
  };
  const skip = (): void => setIndex((n) => Math.min(n + 1, PRESENTER_SCRIPT.length));
  const reset = async (): Promise<void> => {
    if (running.current) return;
    await booth.reset();
    setIndex(0);
    setView("booth");
    setMode("SIMULATED");
  };
  useShortcuts(() => void step(), () => void reset());

  const wide = WIDE_VIEWS.has(view) && !(mode === "REAL" && info?.realCapture);
  return (
    <div className="pr" data-view={view} data-wide={wide}>
      <h1 className="sr-only">{t(UI["shell.presenter"])}</h1>
      <header className="pr-top">
        <Wordmark size="md" />
        <p className="pr-top__hint"><Tx text={UI.presenterUi.shortcuts} /></p>
        <p className="pr-rail"><Icon name="info" size={20} /> <Tx text={S.railBadge} /></p>
      </header>
      <div className="pr-stage">
        <div className="pr-main">
          <Stage view={view} mode={mode} />
          <PhoneQr variant="stage" />
        </div>
        {wide ? null : <BudgetSide packet={state.packet} cards={state.cards} />}
      </div>
      <div className="pr-bar-wrap">
        <PresenterBar index={index} steps={PRESENTER_SCRIPT} mode={mode} realCapture={info?.realCapture ?? null} busy={busy} onStep={() => void step()} onSkip={skip} onReset={() => void reset()} onMode={setMode} lang={lang} onLang={onLang} />
      </div>
    </div>
  );
}

export function PresenterScreen(): ReactElement {
  const { locale } = useLocale();
  const [lang, setLang] = useState<PresenterLang>(locale);
  return (
    <LocaleProvider locale={lang === "both" ? "en" : lang}>
      <BothLanguages on={lang === "both"}>
        <PresenterBody lang={lang} onLang={setLang} />
      </BothLanguages>
    </LocaleProvider>
  );
}
