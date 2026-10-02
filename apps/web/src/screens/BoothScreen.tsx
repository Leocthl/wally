// Booth (docs/06): the preset mandate is sealed on load; a judge presses scenarios or types a listing, watches the trace,
// the cards and the log, and can Verify and Tamper. On a phone: tabs Packet, Run, Log (docs/04 Phone); wide screens show all.
import { useState, type KeyboardEvent, type ReactElement } from "react";
import type { ScenarioId } from "../api/types";
import { Bi } from "../components/Bi";
import { PacketMeter } from "../components/PacketMeter";
import { ScenarioPicker } from "../components/ScenarioPicker";
import { SIMULATED } from "../domain/provenance";
import { useBoothContext } from "../hooks/useBooth";
import { label, type LabelPair } from "../i18n/label";
import { S } from "../i18n/strings";
import { LogPanel } from "./LogPanel";
import { PacketPanel } from "./PacketPanel";
import { RunPanel } from "./RunPanel";

type Tab = "packet" | "run" | "log";
const TABS: readonly { readonly id: Tab; readonly title: LabelPair }[] = [
  { id: "packet", title: S.navPacket },
  { id: "run", title: S.navRun },
  { id: "log", title: S.navLog },
];
const ASK = label("An escalation is waiting for you", "有一項待你確認的升級");

const KEY_STEP: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowLeft: -1 };

/** Roving tabindex: arrows move one tab, Home and End jump to the ends. Returns the tab to select, or null for other keys. */
function nextTab(key: string, current: Tab): Tab | null {
  const i = TABS.findIndex((t) => t.id === current);
  const target = key === "Home" ? 0 : key === "End" ? TABS.length - 1 : KEY_STEP[key] === undefined ? null : i + (KEY_STEP[key] ?? 0);
  return target === null ? null : (TABS[(target + TABS.length) % TABS.length]?.id ?? null);
}

export function BoothScreen(): ReactElement {
  const booth = useBoothContext();
  const { state, busy, info } = booth;
  const [tab, setTab] = useState<Tab>("run");
  const open = state.escalations.filter((e) => e.state === "OPEN");

  const onScenario = async (id: ScenarioId): Promise<void> => {
    await booth.runScenario(id);
    if (id === "revoke") setTab("packet");
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>): void => {
    const next = nextTab(e.key, tab);
    if (next === null) return;
    e.preventDefault();
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  return (
    <div className="booth" data-tab={tab}>
      {state.packet ? <div className="booth__meter"><PacketMeter packet={state.packet} prov={SIMULATED} /></div> : null}
      {open.length > 0 ? (
        <div className="booth__ask" role="status">
          <Bi text={ASK} />
          <button type="button" className="btn tap" onClick={() => setTab("packet")}>{S.navPacket.en}</button>
        </div>
      ) : null}
      <div className="booth__tabs" role="tablist" aria-label="Booth panels">
        {TABS.map((t) => (
          <button key={t.id} id={`tab-${t.id}`} type="button" role="tab" className="btn tap booth__tab" aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)} onKeyDown={onTabKey}>
            <Bi text={t.title} />
          </button>
        ))}
      </div>
      <div id="panel-run" role="tabpanel" aria-labelledby="tab-run" className="booth__panel booth__panel--run" data-active={tab === "run"}>
        <div className="booth__result"><RunPanel /></div>
        <div className="booth__picker">
          <ScenarioPicker onScenario={(id) => void onScenario(id)} onPropose={(text) => void booth.propose({ listingText: text })} onReset={() => void booth.reset()} busy={busy || !state.mandate} standIn={info?.kind === "mock"} />
        </div>
      </div>
      <div className="booth__col-side">
        <div id="panel-packet" role="tabpanel" aria-labelledby="tab-packet" className="booth__panel" data-active={tab === "packet"}>
          <PacketPanel meter={false} />
        </div>
        <div id="panel-log" role="tabpanel" aria-labelledby="tab-log" className="booth__panel" data-active={tab === "log"}>
          <LogPanel />
        </div>
      </div>
    </div>
  );
}
