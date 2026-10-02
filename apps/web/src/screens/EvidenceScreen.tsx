// Evidence (docs/04 Screens, LEDGER): harness B0/B1/B2 with k/n and intervals, acceptance, judge fit, manual route (E3)
// and OBSERVED captures (E5). Data is bundled at build time, so this works with no network (the deeper view behind DM8).
import { useState, type ReactElement } from "react";
import { Bi } from "../components/Bi";
import { evidenceFile, loadHarnessRuns, loadJudgeFits, type Loaded } from "../evidence/data";
import { CategoryPanel } from "../evidence/components/CategoryPanel";
import { HarnessSection } from "../evidence/components/HarnessSection";
import { CapturesPanel, ManualRoutePanel } from "../evidence/components/HumanPanels";
import { JudgePanel } from "../evidence/components/JudgePanel";
import { RunPicker, UnreadablePanel, WiringBanner } from "../evidence/components/RunStatus";
import { parseCaptures, parseManualRoute, type Captures, type ManualRoute } from "../evidence/humanGuard";
import type { JudgeFit } from "../evidence/judgeFitGuard";
import { pickRun, sortRuns, wiringStatus } from "../evidence/select";
import { E } from "../evidence/strings";
import type { HarnessRun, Parsed } from "../evidence/types";
import "../evidence/evidence.css";

const parseOrNull = <T,>(raw: unknown, parse: (x: unknown) => Parsed<T>): Parsed<T> | null => (raw === undefined ? null : parse(raw));

/** The wiring banner goes above everything about the run, the picker included (task: "above everything"). */
function Chosen({ run, picker }: { readonly run: HarnessRun; readonly picker: ReactElement }): ReactElement {
  const status = wiringStatus(run);
  return (
    <>
      <WiringBanner status={status} run={run} />
      {picker}
      <HarnessSection run={run} wiring={status.wiringOnly} />
      <CategoryPanel run={run} />
    </>
  );
}

export const BUNDLED = {
  harness: loadHarnessRuns(),
  judge: loadJudgeFits(),
  manual: parseOrNull(evidenceFile("manual-route.json"), parseManualRoute),
  captures: parseOrNull(evidenceFile("captures.json"), parseCaptures),
} as const;

export interface EvidenceScreenProps {
  /** Injected in tests; the booth uses the files bundled from data/results and data/evidence. */
  readonly harness?: Loaded<HarnessRun>;
  readonly judge?: Loaded<JudgeFit>;
  readonly manual?: Parsed<ManualRoute> | null;
  readonly captures?: Parsed<Captures> | null;
}

export function EvidenceScreen({ harness = BUNDLED.harness, judge = BUNDLED.judge, manual = BUNDLED.manual, captures = BUNDLED.captures }: EvidenceScreenProps): ReactElement {
  const runs = sortRuns(harness.items);
  const pick = pickRun(runs);
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = runs.find((r) => r.file === chosen) ?? runs.find((r) => r.file === pick?.file) ?? null;
  return (
    <div className="ev" data-register="ledger">
      <h2 className="ev__title"><Bi text={E.title} /></h2>
      <UnreadablePanel files={[...harness.unreadable, ...judge.unreadable]} />
      {selected === null || pick === null ? (
        <Bi as="p" text={E.unreadableNone} className="ev-unreadable" />
      ) : (
        <Chosen run={selected} picker={<RunPicker runs={runs} selected={selected} reason={chosen === null ? pick.reason : "visitor"} onSelect={setChosen} />} />
      )}
      <JudgePanel fit={judge.items[0] ?? null} corpus={selected?.injectionCorpus ?? null} />
      <ManualRoutePanel parsed={manual} />
      <CapturesPanel parsed={captures} />
    </div>
  );
}
