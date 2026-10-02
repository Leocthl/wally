// Presenter (docs/04 Screens): big screen. Run two thirds, PacketMeter one third, numerals at --fs-6 and up,
// PresenterBar at the bottom. The Driver steps through the DM beats; nothing else (docs/06 Roles).
import { useState, type ReactElement } from "react";
import { CardTicket } from "../components/CardTicket";
import { MandateSummary } from "../components/MandateSummary";
import { PacketMeter } from "../components/PacketMeter";
import { PresenterBar, type Mode } from "../components/PresenterBar";
import { RealCapturePanel } from "../components/RealCapturePanel";
import { Bi } from "../components/Bi";
import { PRESENTER_SCRIPT, type View } from "../booth/presenterScript";
import { SIMULATED } from "../domain/provenance";
import { useBoothContext } from "../hooks/useBooth";
import { label } from "../i18n/label";
import { LogPanel } from "./LogPanel";
import { RunPanel } from "./RunPanel";

const DECK = label("Slides carry this beat. The evidence screen arrives with the harness results.", "此環節由投影片展示；證據畫面會在測試結果完成後加入。");

export function PresenterScreen(): ReactElement {
  const booth = useBoothContext();
  const { state, busy, info } = booth;
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<Mode>("SIMULATED");
  const [view, setView] = useState<View>("booth");

  const step = async (): Promise<void> => {
    const current = PRESENTER_SCRIPT[index];
    if (!current) return;
    await booth.exec(() => current.run(booth.api));
    setIndex((n) => n + 1);
    setView(current.view);
  };
  const skip = (): void => setIndex((n) => n + 1);
  const reset = async (): Promise<void> => {
    await booth.reset();
    setIndex(0);
    setView("booth");
    setMode("SIMULATED");
  };

  const stage = ((): ReactElement => {
    if (mode === "REAL" && info?.realCapture) return <RealCapturePanel capture={info.realCapture} />;
    if (view === "seal" && state.mandate) return <MandateSummary mandate={state.mandate} prov={SIMULATED} />;
    if (view === "log") return <LogPanel />;
    if (view === "deck") return <Bi as="p" text={DECK} className="presenter__big-note" />;
    return <RunPanel />;
  })();

  return (
    <div className="presenter" data-register="ledger">
      <div className="presenter__stage">
        <div className="presenter__run">{stage}</div>
        <aside className="presenter__side" aria-label="Packet">
          {state.packet ? <PacketMeter packet={state.packet} prov={SIMULATED} size="l" /> : null}
          {state.cards.map((c) => <CardTicket key={c.id} card={c} />)}
        </aside>
      </div>
      <div className="presenter__bar">
        <PresenterBar index={index} steps={PRESENTER_SCRIPT} mode={mode} realCapture={info?.realCapture ?? null} busy={busy} onStep={() => void step()} onSkip={skip} onReset={() => void reset()} onMode={setMode} />
      </div>
    </div>
  );
}
